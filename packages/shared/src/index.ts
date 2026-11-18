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
}

export const MAX_URL_LENGTH = 2048;

/** Cuerpo de POST /api/audits. strict(): rechaza campos desconocidos. */
export const createAuditRequestSchema = z
  .object({ url: z.string().trim().min(1).max(MAX_URL_LENGTH) })
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
}
