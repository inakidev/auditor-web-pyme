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
  critical: { label: 'Crítica', className: 'bg-red-700 text-white' },
  high: { label: 'Alta', className: 'bg-orange-700 text-white' },
  medium: { label: 'Media', className: 'bg-yellow-700 text-white' },
  // Azul y no verde: el verde se reserva para "Cumple".
  low: { label: 'Baja', className: 'bg-blue-700 text-white' },
  info: { label: 'Info', className: 'bg-slate-600 text-white' },
};

/** Lo que conviene arreglar primero: no cumple y advertencias con peso, por severidad. */
/** Lo que conviene arreglar primero: por prioridad y, a igual prioridad, "no cumple" antes. */
export function priorityFindings(findings: readonly Finding[], limit = 5): Finding[] {
  return findings
    .filter(isPending)
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    )
    .slice(0, limit);
}

/** Algo para resolver que pesa en el puntaje (las sugerencias informativas no restan). */
export function isPending(finding: Finding): boolean {
  return isActionable(finding) && finding.severity !== 'info';
}

/** En lo que cumple o no aplica no se muestran severidad ni esfuerzo. */
export function isActionable(finding: Finding): boolean {
  return finding.status === 'fail' || finding.status === 'warn';
}

/**
 * Ancho de una barra sin estilos inline (la CSP no permite 'unsafe-inline'). Se redondea a pasos
 * de 5 %; el valor exacto va en aria-valuenow. Las clases están escritas enteras para que
 * Tailwind las genere.
 */
const WIDTH_CLASSES = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

export function widthClass(percent: number): string {
  const step = Math.round(Math.min(Math.max(percent, 0), 100) / 5);
  return WIDTH_CLASSES[step] ?? 'w-0';
}
