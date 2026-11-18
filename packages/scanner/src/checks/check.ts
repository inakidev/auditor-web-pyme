import type { Category, Effort, Finding, FindingStatus, Severity } from '@auditor/shared';
import type { AuditContext } from '../audit/context.js';

/** Interfaz de CLAUDE.md: cada check es independiente y no hace requests. */
export interface Check {
  readonly id: string;
  readonly category: Category;
  run(ctx: AuditContext): Promise<Finding[]>;
}

export const MAX_EVIDENCE = 300;

export function truncateEvidence(text: string): string {
  return text.length <= MAX_EVIDENCE ? text : `${text.slice(0, MAX_EVIDENCE - 1)}…`;
}

export interface FindingFields {
  readonly status: FindingStatus;
  readonly title: string;
  readonly recommendation: string;
  readonly evidence?: string | null;
  readonly severity?: Severity;
  readonly effort?: Effort;
}

/** Arma un hallazgo con la severidad por defecto del catálogo y la evidencia truncada. */
export function makeFinding(
  meta: { readonly id: string; readonly category: Category; readonly severity: Severity },
  fields: FindingFields,
): Finding {
  return {
    checkId: meta.id,
    category: meta.category,
    status: fields.status,
    severity: fields.severity ?? meta.severity,
    title: fields.title,
    evidence:
      fields.evidence === undefined || fields.evidence === null
        ? null
        : truncateEvidence(fields.evidence),
    recommendation: fields.recommendation,
    effort: fields.effort ?? 'low',
  };
}

/** Define un check de un solo hallazgo a partir de una función pura. */
export function defineCheck(
  meta: { readonly id: string; readonly category: Category; readonly severity: Severity },
  evaluate: (ctx: AuditContext) => FindingFields,
): Check {
  return {
    id: meta.id,
    category: meta.category,
    run: (ctx) => Promise.resolve([makeFinding(meta, evaluate(ctx))]),
  };
}

/** Valor de una cabecera (las repetidas se unen con coma). */
export function header(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value.join(', ') : value;
}

export const NA_NO_RESPONSE: FindingFields = {
  status: 'na',
  title: 'No pudimos revisar las cabeceras',
  recommendation: 'Volvé a intentar la revisión cuando el sitio esté disponible.',
};

/** Fecha en formato dd/mm/aaaa (UTC), sin depender del idioma del sistema. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear())}`;
}
