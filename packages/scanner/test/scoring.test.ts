import type { Category, Finding, FindingStatus, Severity } from '@auditor/shared';
import { describe, expect, it } from 'vitest';
import { bandFor, scoreFindings } from '../src/scoring/score.js';

// Puntaje (RF-07): fórmula y pesos de la sección 5 del plan.

const f = (
  category: Category,
  severity: Severity,
  status: FindingStatus,
  id = `${category}-${severity}-${status}`,
): Finding => ({
  checkId: id,
  category,
  status,
  severity,
  title: '',
  evidence: null,
  recommendation: '',
  effort: 'low',
  guide: null,
});

describe('scoreFindings', () => {
  it('aplica 100 × Σ(peso × resultado) / Σ(peso) por categoría', () => {
    const scores = scoreFindings([
      f('security', 'critical', 'pass'), // 5 × 1
      f('security', 'high', 'fail'), //     3 × 0
      f('security', 'medium', 'warn'), //   2 × 0,5
    ]);
    expect(scores.categories.security).toBe(60);
  });

  it('excluye "no aplica", "no evaluado" y los informativos (peso 0)', () => {
    const scores = scoreFindings([
      f('seo', 'high', 'pass'),
      f('seo', 'critical', 'na'),
      f('seo', 'critical', 'not_evaluated'),
      f('seo', 'info', 'fail'),
    ]);
    expect(scores.categories.seo).toBe(100);
  });

  it('una categoría sin checks con peso queda sin datos (null), nunca 0', () => {
    const scores = scoreFindings([
      f('analytics', 'info', 'pass'),
      f('trust', 'high', 'not_evaluated'),
    ]);
    expect(scores.categories.analytics).toBeNull();
    expect(scores.categories.trust).toBeNull();
    expect(scores.total).toBeNull();
    expect(scores.band).toBeNull();
    expect(scores.categoriesUsed).toBe(0);
  });

  it('el global repondera entre las categorías con datos e informa sobre cuántas se calculó', () => {
    const scores = scoreFindings([
      f('security', 'critical', 'pass'),
      f('security', 'high', 'fail'),
      f('security', 'medium', 'warn'), // 60
      f('seo', 'high', 'pass'), //         100
    ]);
    // (60 × 0,35 + 100 × 0,30) / 0,65 = 78,46
    expect(scores.total).toBe(78);
    expect(scores.band).toBe('B');
    expect(scores.categoriesUsed).toBe(2);
    expect(scores.categoriesTotal).toBe(5);
  });

  it('es determinista: el orden de los hallazgos no cambia el resultado', () => {
    const findings = [
      f('security', 'high', 'pass'),
      f('seo', 'low', 'fail'),
      f('performance', 'medium', 'warn'),
    ];
    expect(scoreFindings([...findings].reverse())).toEqual(scoreFindings(findings));
  });

  it('sin hallazgos no hay puntaje', () => {
    expect(scoreFindings([])).toMatchObject({ total: null, band: null, categoriesUsed: 0 });
  });
});

describe('bandFor', () => {
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89, 'B'],
    [75, 'B'],
    [74, 'C'],
    [60, 'C'],
    [59, 'D'],
    [40, 'D'],
    [39, 'E'],
    [0, 'E'],
  ])('%i → %s', (total, band) => {
    expect(bandFor(total)).toBe(band);
  });
});
