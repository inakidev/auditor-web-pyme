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

// --- Panel de consultores (RF-12, RNF-02) ---

/** Tope de largo de la contraseña: acota el trabajo de argon2 ante entradas enormes. */
export const MAX_PASSWORD_LENGTH = 256;

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email()),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface CsrfView {
  readonly csrfToken: string;
}

export interface SessionView {
  readonly email: string;
  readonly csrfToken: string;
}

export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 1000;

const pageFields = {
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  /** Solo caracteres de dominio: sin comodines de LIKE que escapar. */
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]{1,253}$/)
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
};

export const adminAuditsQuerySchema = z
  .object({
    ...pageFields,
    status: z.enum(AUDIT_STATUSES).optional(),
    minScore: z.coerce.number().int().min(0).max(100).optional(),
    maxScore: z.coerce.number().int().min(0).max(100).optional(),
  })
  .strict();
export type AdminAuditsQuery = z.infer<typeof adminAuditsQuerySchema>;

export const adminLeadsQuerySchema = z
  .object({ ...pageFields, status: z.enum(LEAD_STATUSES).optional() })
  .strict();
export type AdminLeadsQuery = z.infer<typeof adminLeadsQuerySchema>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminAuditItem {
  readonly id: number;
  readonly url: string;
  readonly domain: string;
  readonly status: AuditStatus;
  readonly createdAt: string;
  readonly scoreTotal: number | null;
  readonly scoreBand: Band | null;
  readonly hasLead: boolean;
}

export interface AdminLeadItem {
  readonly id: number;
  readonly email: string;
  readonly domain: string;
  readonly status: LeadStatus;
  readonly consentAt: string;
  readonly consentTextVersion: string;
  readonly createdAt: string;
  /** Última auditoría pedida con este contacto, para abrir el detalle. */
  readonly lastAuditId: number | null;
}

export interface AdminAuditDetail {
  readonly id: number;
  readonly domain: string;
  readonly audit: AuditView;
  readonly lead: {
    readonly id: number;
    readonly email: string;
    readonly consentAt: string;
    readonly consentTextVersion: string;
  } | null;
}

// --- Retención y configuración pública (H14, H15) ---

/** Días que se conserva un informe antes de la purga automática (RF-09, RF-16). */
export const AUDIT_RETENTION_DAYS = 30;
/** Días que se conserva un contacto después de su última auditoría (RNF-05). */
export const LEAD_RETENTION_DAYS = 30;

/** Lo que la web necesita saber del despliegue (GET /api/config). */
export interface PublicConfig {
  /** Si se puede dejar el correo. Apagado hasta publicar los textos legales. */
  readonly contactCapture: boolean;
  /** Aviso de demo: base efímera y arranque en frío. */
  readonly demoNotice: boolean;
}

// --- Seguimiento de contactos (H18, RF-14) ---

export const MAX_NOTE_LENGTH = 2000;
export const LEAD_EVENT_TYPES = ['status', 'note'] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) }).strict();
export const addLeadNoteSchema = z
  .object({ note: z.string().trim().min(1).max(MAX_NOTE_LENGTH) })
  .strict();

/** Un cambio de estado o una nota, con fecha y usuario (RF-14). */
export interface LeadEvent {
  readonly id: number;
  readonly type: LeadEventType;
  readonly status: LeadStatus | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly userEmail: string;
}

export interface AdminLeadDetail {
  readonly lead: AdminLeadItem;
  /** Más reciente primero. */
  readonly events: readonly LeadEvent[];
}
