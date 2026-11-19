// Esquemas zod y tipos compartidos entre api, web y scanner.
import { z } from 'zod';

export const AUDIT_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const CATEGORIES = ['security', 'seo', 'analytics', 'trust', 'performance'] as const;
export type Category = (typeof CATEGORIES)[number];

/** not_evaluated: el control no se pudo evaluar; se muestra y queda fuera del puntaje. */
export const FINDING_STATUSES = ['pass', 'warn', 'fail', 'na', 'not_evaluated'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** C crítica, A alta, M media, B baja, I informativa (catálogo del plan, sección 5). */
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EFFORTS = ['low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface Finding {
  readonly checkId: string;
  readonly category: Category;
  readonly status: FindingStatus;
  readonly severity: Severity;
  readonly title: string;
  /** Evidencia truncada (máx. 300 caracteres). Nunca valores de cookies ni contenido de páginas. */
  readonly evidence: string | null;
  readonly recommendation: string;
  readonly effort: Effort;
  /** Guía externa (constante del código, siempre https). */
  readonly guide: string | null;
}

/** Fases de la auditoría (pantalla P2). Lista cerrada: el porcentaje se calcula a partir de la fase. */
export const AUDIT_PHASES = [
  'validating',
  'downloading',
  'security',
  'seo',
  'analytics_trust',
  'scoring',
] as const;
export type AuditPhase = (typeof AUDIT_PHASES)[number];

export const BANDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Band = (typeof BANDS)[number];

/** Puntajes de 0 a 100. null = sin datos (ningún check aplicable con peso). */
export interface Scores {
  readonly total: number | null;
  readonly band: Band | null;
  readonly categories: Readonly<Record<Category, number | null>>;
  /** Sobre cuántas categorías se calculó el global. */
  readonly categoriesUsed: number;
  readonly categoriesTotal: number;
}

export const MAX_URL_LENGTH = 2048;

export const MAX_EMAIL_LENGTH = 254;

/** Texto de la casilla de consentimiento (RF-11). Si cambia, se sube la versión. */
export const CONSENT_TEXT = 'Acepto que me contacten con el informe';
export const CONSENT_TEXT_VERSION = '2026-11-18';

export const LEAD_STATUSES = ['new', 'contacted', 'proposal', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Cuerpo de POST /api/audits. strict(): rechaza campos desconocidos. */
export const createAuditRequestSchema = z
  .object({
    url: z.string().trim().min(1).max(MAX_URL_LENGTH),
    email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email()).optional(),
    consent: z.boolean().optional(),
  })
  .strict();
export type CreateAuditRequest = z.infer<typeof createAuditRequestSchema>;

/** Token de 256 bits en base64url (43 caracteres). */
export const AUDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface CreateAuditResponse {
  readonly token: string;
}

export interface ApiError {
  readonly error: { readonly code: string; readonly message: string };
}

export interface AuditView {
  readonly status: AuditStatus;
  readonly url: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly expiresAt: string;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly findings: readonly Finding[];
  /** Solo cuando la auditoría terminó. */
  readonly scores: Scores | null;
  /** Fase actual, solo mientras la auditoría corre. */
  readonly phase: AuditPhase | null;
}
