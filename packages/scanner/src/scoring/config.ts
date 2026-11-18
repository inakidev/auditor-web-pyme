// Configuración del puntaje (plan, sección 5). Se ajusta con los resultados de las pruebas de
// usabilidad: cambiar estos valores no requiere tocar la fórmula.
import type { Band, Category, FindingStatus, Severity } from '@auditor/shared';

export interface ScoringConfig {
  readonly severityWeights: Readonly<Record<Severity, number>>;
  /** Resultado por estado. Los estados ausentes (na, not_evaluated) se excluyen. */
  readonly statusResults: Readonly<Partial<Record<FindingStatus, number>>>;
  readonly categoryWeights: Readonly<Record<Category, number>>;
  /** Bandas de mayor a menor: la primera cuyo mínimo se alcanza. */
  readonly bands: readonly { readonly band: Band; readonly min: number }[];
}

export const DEFAULT_SCORING: ScoringConfig = {
  severityWeights: { critical: 5, high: 3, medium: 2, low: 1, info: 0 },
  statusResults: { pass: 1, warn: 0.5, fail: 0 },
  categoryWeights: { security: 0.35, seo: 0.3, analytics: 0.15, trust: 0.15, performance: 0.05 },
  bands: [
    { band: 'A', min: 90 },
    { band: 'B', min: 75 },
    { band: 'C', min: 60 },
    { band: 'D', min: 40 },
    { band: 'E', min: 0 },
  ],
};
