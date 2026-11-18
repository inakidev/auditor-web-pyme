import { CATEGORIES, type Band, type Category, type Finding, type Scores } from '@auditor/shared';
import { DEFAULT_SCORING, type ScoringConfig } from './config.js';

/**
 * Puntaje por categoría: 100 × Σ(peso × resultado) / Σ(peso). "No aplica", "no evaluado" y los
 * checks de peso 0 quedan afuera; una categoría sin checks con peso queda sin datos (null).
 * El global repondera entre las categorías con datos. Función pura y determinista.
 */
export function scoreFindings(
  findings: readonly Finding[],
  config: ScoringConfig = DEFAULT_SCORING,
): Scores {
  const categories = Object.fromEntries(
    CATEGORIES.map((category) => [category, categoryScore(findings, category, config)]),
  ) as Record<Category, number | null>;

  let weighted = 0;
  let weightSum = 0;
  for (const category of CATEGORIES) {
    const score = categories[category];
    if (score === null) continue;
    weighted += score * config.categoryWeights[category];
    weightSum += config.categoryWeights[category];
  }
  const total = weightSum === 0 ? null : Math.round(weighted / weightSum);
  const rounded = Object.fromEntries(
    CATEGORIES.map((c) => [c, categories[c] === null ? null : Math.round(categories[c])]),
  ) as Record<Category, number | null>;

  return {
    total,
    band: total === null ? null : bandFor(total, config),
    categories: rounded,
    categoriesUsed: CATEGORIES.filter((c) => categories[c] !== null).length,
    categoriesTotal: CATEGORIES.length,
  };
}

function categoryScore(
  findings: readonly Finding[],
  category: Category,
  config: ScoringConfig,
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const finding of findings) {
    if (finding.category !== category) continue;
    const result = config.statusResults[finding.status];
    const weight = config.severityWeights[finding.severity];
    if (result === undefined || weight === 0) continue;
    numerator += weight * result;
    denominator += weight;
  }
  return denominator === 0 ? null : (100 * numerator) / denominator;
}

export function bandFor(total: number, config: ScoringConfig = DEFAULT_SCORING): Band {
  return config.bands.find((b) => total >= b.min)?.band ?? 'E';
}
