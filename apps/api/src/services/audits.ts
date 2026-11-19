import { scoreFindings } from '@auditor/scanner';
import {
  CATEGORIES,
  CONSENT_TEXT_VERSION,
  type Category,
  type Finding,
  type Scores,
} from '@auditor/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { audits, findings, leads } from '../db/schema.js';

/** Los informes vencen a los 30 días (RF-09). */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AuditRow = typeof audits.$inferSelect;

export function createAuditRepository(db: Db) {
  return {
    /** Crea la auditoría y, si hay correo con consentimiento, el contacto (en una transacción). */
    create(input: {
      tokenHash: string;
      url: string;
      domain: string;
      now: Date;
      lead?: { email: string };
    }): number {
      return db.transaction((tx) => {
        const leadId =
          input.lead === undefined
            ? null
            : tx
                .insert(leads)
                .values({
                  email: input.lead.email,
                  consentAt: input.now,
                  consentTextVersion: CONSENT_TEXT_VERSION,
                  domain: input.domain,
                  status: 'new',
                  createdAt: input.now,
                })
                .returning({ id: leads.id })
                .get().id;
        return tx
          .insert(audits)
          .values({
            tokenHash: input.tokenHash,
            url: input.url,
            domain: input.domain,
            status: 'queued',
            createdAt: input.now,
            expiresAt: new Date(input.now.getTime() + RETENTION_MS),
            leadId,
          })
          .returning({ id: audits.id })
          .get().id;
      });
    },

    findById(id: number): AuditRow | undefined {
      return db.select().from(audits).where(eq(audits.id, id)).get();
    },

    findByTokenHash(tokenHash: string): AuditRow | undefined {
      return db.select().from(audits).where(eq(audits.tokenHash, tokenHash)).get();
    },

    findingsOf(auditId: number): Finding[] {
      return db
        .select({
          checkId: findings.checkId,
          category: findings.category,
          status: findings.status,
          severity: findings.severity,
          title: findings.title,
          evidence: findings.evidence,
          recommendation: findings.recommendation,
          effort: findings.effort,
          guide: findings.guide,
        })
        .from(findings)
        .where(eq(findings.auditId, auditId))
        .orderBy(asc(findings.id))
        .all();
    },

    markRunning(id: number, now: Date): void {
      db.update(audits).set({ status: 'running', startedAt: now }).where(eq(audits.id, id)).run();
    },

    markDone(id: number, results: readonly Finding[], now: Date): void {
      db.transaction((tx) => {
        if (results.length > 0) {
          tx.insert(findings)
            .values(results.map((f) => ({ ...f, auditId: id })))
            .run();
        }
        const scores = scoreFindings(results);
        tx.update(audits)
          .set({
            status: 'done',
            finishedAt: now,
            scoreTotal: scores.total,
            scoreBand: scores.band,
            scoreSecurity: scores.categories.security,
            scoreSeo: scores.categories.seo,
            scoreAnalytics: scores.categories.analytics,
            scoreTrust: scores.categories.trust,
            scorePerf: scores.categories.performance,
          })
          .where(eq(audits.id, id))
          .run();
      });
    },

    markFailed(id: number, errorCode: string, now: Date): void {
      db.update(audits)
        .set({ status: 'failed', errorCode, finishedAt: now })
        .where(eq(audits.id, id))
        .run();
    },

    /** Al arrancar: lo que corría se interrumpió; lo que esperaba se retoma (en orden). */
    recover(now: Date): number[] {
      db.update(audits)
        .set({ status: 'failed', errorCode: 'INTERRUPTED', finishedAt: now })
        .where(eq(audits.status, 'running'))
        .run();
      return db
        .select({ id: audits.id })
        .from(audits)
        .where(eq(audits.status, 'queued'))
        .orderBy(asc(audits.id))
        .all()
        .map((row) => row.id);
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

/** Puntajes guardados de una auditoría terminada. */
export function scoresOf(row: AuditRow): Scores {
  const categories: Record<Category, number | null> = {
    security: row.scoreSecurity,
    seo: row.scoreSeo,
    analytics: row.scoreAnalytics,
    trust: row.scoreTrust,
    performance: row.scorePerf,
  };
  return {
    total: row.scoreTotal,
    band: row.scoreBand,
    categories,
    categoriesUsed: CATEGORIES.filter((c) => categories[c] !== null).length,
    categoriesTotal: CATEGORIES.length,
  };
}
