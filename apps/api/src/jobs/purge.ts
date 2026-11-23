import { LEAD_RETENTION_DAYS } from '@auditor/shared';
import { and, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { COUNTER_DECAY_MS } from '../auth/lockout.js';
import type { Db } from '../db/client.js';
import { audits, leads, loginCounters, sessions } from '../db/schema.js';
import { SESSION_IDLE_MS } from '../services/auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Se corre al arrancar y cada hora (RF-16 pide al menos una vez por día). */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface PurgeResult {
  readonly audits: number;
  readonly leads: number;
  readonly sessions: number;
  readonly counters: number;
}

/** Borra todo lo vencido en una sola transacción (H14, RNF-05). */
export function purgeExpired(db: Db, now: Date): PurgeResult {
  const t = now.getTime();
  return db.transaction((tx) => {
    // Informes de más de 30 días; los hallazgos se van por ON DELETE CASCADE.
    const purgedAudits = tx.delete(audits).where(lte(audits.expiresAt, now)).run().changes;

    // Contactos: 30 días después de su última auditoría (o de su alta, si no le quedan).
    const leadCutoff = t - LEAD_RETENTION_DAYS * DAY_MS;
    const lastActivity = sql<number>`coalesce((select max(${audits.createdAt}) from ${audits} where ${audits.leadId} = ${leads.id}), ${leads.createdAt})`;
    const staleLeads = tx
      .select({ id: leads.id })
      .from(leads)
      .where(lte(lastActivity, leadCutoff))
      .all()
      .map((row) => row.id);
    let purgedLeads = 0;
    if (staleLeads.length > 0) {
      // La migración 0003 creó lead_id sin ON DELETE SET NULL (D-02): se desvincula a mano.
      tx.update(audits).set({ leadId: null }).where(inArray(audits.leadId, staleLeads)).run();
      purgedLeads = tx.delete(leads).where(inArray(leads.id, staleLeads)).run().changes;
    }

    const purgedSessions = tx
      .delete(sessions)
      .where(
        or(lte(sessions.expiresAt, now), lte(sessions.lastSeenAt, new Date(t - SESSION_IDLE_MS))),
      )
      .run().changes;

    // Igual que recordFailure: pasado el horizonte sin fallos el contador vuelve a cero, así que
    // borrarlo no cambia nada. Nunca se borra uno con bloqueo vigente.
    const purgedCounters = tx
      .delete(loginCounters)
      .where(
        and(
          lt(loginCounters.lastFailureAt, t - COUNTER_DECAY_MS),
          lte(loginCounters.lockedUntil, t),
        ),
      )
      .run().changes;

    return {
      audits: purgedAudits,
      leads: purgedLeads,
      sessions: purgedSessions,
      counters: purgedCounters,
    };
  });
}
