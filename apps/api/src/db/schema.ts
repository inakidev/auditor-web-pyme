import {
  AUDIT_STATUSES,
  BANDS,
  CATEGORIES,
  EFFORTS,
  FINDING_STATUSES,
  LEAD_STATUSES,
  SEVERITIES,
} from '@auditor/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Modelo de datos del plan (sección 3). La IP hasheada (H13) se agrega con una migración en su historia.

/** Contactos con consentimiento expreso (RF-11). Nunca se guarda un correo sin consentimiento. */
export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    consentAt: integer('consent_at', { mode: 'timestamp_ms' }).notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    domain: text('domain').notNull(),
    status: text('status', { enum: LEAD_STATUSES }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('leads_domain_idx').on(t.domain), index('leads_created_at_idx').on(t.createdAt)],
);

export const audits = sqliteTable(
  'audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** SHA-256 del token: el token en claro nunca se guarda. */
    tokenHash: text('token_hash').notNull().unique(),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    status: text('status', { enum: AUDIT_STATUSES }).notNull(),
    errorCode: text('error_code'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    // Puntajes de 0 a 100 (H7); null = sin datos.
    scoreTotal: integer('score_total'),
    scoreBand: text('score_band', { enum: BANDS }),
    scoreSecurity: integer('score_security'),
    scoreSeo: integer('score_seo'),
    scoreAnalytics: integer('score_analytics'),
    scoreTrust: integer('score_trust'),
    scorePerf: integer('score_perf'),
    leadId: integer('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('audits_domain_idx').on(t.domain),
    index('audits_created_at_idx').on(t.createdAt),
    index('audits_expires_at_idx').on(t.expiresAt),
    index('audits_status_idx').on(t.status),
  ],
);

export const findings = sqliteTable(
  'findings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    auditId: integer('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    checkId: text('check_id').notNull(),
    category: text('category', { enum: CATEGORIES }).notNull(),
    status: text('status', { enum: FINDING_STATUSES }).notNull(),
    severity: text('severity', { enum: SEVERITIES }).notNull(),
    title: text('title').notNull(),
    evidence: text('evidence'),
    recommendation: text('recommendation').notNull(),
    effort: text('effort', { enum: EFFORTS }).notNull(),
    guide: text('guide'),
  },
  (t) => [index('findings_audit_id_idx').on(t.auditId)],
);

// --- Panel de consultores (RF-12, RNF-02) ---

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  /** argon2id; la contraseña en claro nunca se guarda. */
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 del id de sesión: el id en claro solo viaja en la cookie. */
    idHash: text('id_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    /** Vencimiento absoluto (8 h desde el ingreso). */
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('sessions_expires_at_idx').on(t.expiresAt)],
);

/** Contadores de intentos fallidos. La clave es un HMAC: ni correo ni IP en claro. */
export const loginCounters = sqliteTable('login_counters', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull(),
  lastFailureAt: integer('last_failure_at').notNull(),
  lockedUntil: integer('locked_until').notNull(),
});
