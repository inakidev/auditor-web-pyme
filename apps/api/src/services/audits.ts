import type { Finding } from '@auditor/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { audits, findings } from '../db/schema.js';

/** Los informes vencen a los 30 días (RF-09). */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AuditRow = typeof audits.$inferSelect;

export function createAuditRepository(db: Db) {
  return {
    create(input: { tokenHash: string; url: string; domain: string; now: Date }): number {
      const row = db
        .insert(audits)
        .values({
          tokenHash: input.tokenHash,
          url: input.url,
          domain: input.domain,
          status: 'queued',
          createdAt: input.now,
          expiresAt: new Date(input.now.getTime() + RETENTION_MS),
        })
        .returning({ id: audits.id })
        .get();
      return row.id;
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
        tx.update(audits).set({ status: 'done', finishedAt: now }).where(eq(audits.id, id)).run();
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
