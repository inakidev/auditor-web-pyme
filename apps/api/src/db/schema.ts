import { AUDIT_STATUSES, CATEGORIES, EFFORTS, FINDING_STATUSES, SEVERITIES } from '@auditor/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Modelo de datos del plan (sección 3). Los puntajes (H7), el lead (H11) y la IP hasheada (H13)
// se agregan con migraciones en sus historias.

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
  },
  (t) => [index('findings_audit_id_idx').on(t.auditId)],
);
