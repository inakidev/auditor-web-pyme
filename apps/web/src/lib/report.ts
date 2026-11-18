import type { Category, Effort, Finding, FindingStatus, Severity } from '@auditor/shared';

export const STATUS_LABEL: Record<FindingStatus, string> = {
  fail: 'No cumple',
  warn: 'Advertencia',
  pass: 'Cumple',
  na: 'No aplica',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  info: 'Informativa',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  security: 'Seguridad',
  seo: 'SEO',
  analytics: 'Analítica',
  trust: 'Confianza y contacto',
  performance: 'Rendimiento',
};

export const EFFORT_LABEL: Record<Effort, string> = {
  low: 'bajo',
  medium: 'medio',
  high: 'alto',
};

/** Colores con contraste AA (texto oscuro sobre fondo claro). */
export const STATUS_STYLE: Record<FindingStatus, string> = {
  fail: 'bg-red-100 text-red-900 border-red-300',
  warn: 'bg-amber-100 text-amber-900 border-amber-300',
  pass: 'bg-green-100 text-green-900 border-green-300',
  na: 'bg-slate-100 text-slate-800 border-slate-300',
};

const STATUS_ORDER: FindingStatus[] = ['fail', 'warn', 'pass', 'na'];
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Primero lo que no cumple y, dentro de cada estado, lo más grave. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

export function countByStatus(findings: readonly Finding[]): Record<FindingStatus, number> {
  const counts: Record<FindingStatus, number> = { fail: 0, warn: 0, pass: 0, na: 0 };
  for (const finding of findings) counts[finding.status] += 1;
  return counts;
}
