import {
  AUDIT_PHASES,
  type AuditPhase,
  type Category,
  type Effort,
  type Finding,
  type FindingStatus,
  type Severity,
} from '@auditor/shared';

export const STATUS_LABEL: Record<FindingStatus, string> = {
  fail: 'No cumple',
  warn: 'Advertencia',
  pass: 'Cumple',
  na: 'No aplica',
  not_evaluated: 'No evaluado',
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
  not_evaluated: 'bg-slate-50 text-slate-800 border-dashed border-slate-400',
};

const STATUS_ORDER: FindingStatus[] = ['fail', 'warn', 'not_evaluated', 'pass', 'na'];
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
  const counts: Record<FindingStatus, number> = {
    fail: 0,
    warn: 0,
    pass: 0,
    na: 0,
    not_evaluated: 0,
  };
  for (const finding of findings) counts[finding.status] += 1;
  return counts;
}

/** Textos de cada fase (pantalla P2). */
export const PHASE_LABEL: Record<AuditPhase, string> = {
  validating: 'Validando el destino',
  downloading: 'Descargando el sitio',
  security: 'Revisando seguridad',
  seo: 'Revisando SEO',
  analytics_trust: 'Revisando analítica y confianza',
  scoring: 'Calculando el puntaje',
};

/** Porcentaje de la barra, calculado a partir de la fase. */
export function phaseProgress(phase: AuditPhase | null): number {
  return phase === null ? 0 : Math.round((AUDIT_PHASES.indexOf(phase) / AUDIT_PHASES.length) * 100);
}

/** Etiquetas de prioridad del wireframe P3, con contraste AA (texto blanco sobre fondo oscuro). */
export const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
  critical: { label: 'Crítico', className: 'bg-red-700 text-white' },
  high: { label: 'Alto', className: 'bg-orange-700 text-white' },
  medium: { label: 'Medio', className: 'bg-yellow-700 text-white' },
  low: { label: 'Bajo', className: 'bg-green-700 text-white' },
  info: { label: 'Info', className: 'bg-slate-600 text-white' },
};

/** Lo que conviene arreglar primero: no cumple y advertencias con peso, por severidad. */
export function priorityFindings(findings: readonly Finding[], limit = 5): Finding[] {
  return sortFindings(findings)
    .filter((f) => (f.status === 'fail' || f.status === 'warn') && f.severity !== 'info')
    .slice(0, limit);
}

/** En lo que cumple o no aplica no se muestran severidad ni esfuerzo. */
export function isActionable(finding: Finding): boolean {
  return finding.status === 'fail' || finding.status === 'warn';
}
