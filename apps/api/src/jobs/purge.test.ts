import type { Finding } from '@auditor/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { IP_POLICY, PAIR_POLICY } from '../auth/lockout.js';
import { openDatabase } from '../db/client.js';
import { audits, findings, leads, loginCounters, sessions, users } from '../db/schema.js';
import { createAuditRepository } from '../services/audits.js';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, createAuthRepository } from '../services/auth.js';
import { purgeExpired } from './purge.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60_000;
const T0 = new Date('2026-11-01T12:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const FINDING: Finding = {
  checkId: 'SEC-07',
  category: 'security',
  status: 'fail',
  severity: 'low',
  title: 'x',
  evidence: null,
  recommendation: 'y',
  effort: 'low',
  guide: null,
};

function setup() {
  const db = openDatabase(':memory:');
  const repo = createAuditRepository(db);
  const auth = createAuthRepository(db);
  const audit = (createdAt: Date, email?: string) => {
    const id = repo.create({
      tokenHash: `h-${String(Math.random())}`,
      url: 'https://ejemplo.com/',
      domain: 'ejemplo.com',
      now: createdAt,
      ...(email === undefined ? {} : { lead: { email } }),
    });
    repo.markDone(id, [FINDING, FINDING], createdAt);
    return id;
  };
  return { db, repo, auth, audit };
}

describe('purgeExpired: informes', () => {
  it('borra los informes al cumplir 30 días, con sus hallazgos, y conserva los más nuevos', () => {
    const { db, audit } = setup();
    const old = audit(T0);
    const recent = audit(at(DAY));
    expect(purgeExpired(db, at(30 * DAY - 1)).audits).toBe(0);
    const result = purgeExpired(db, at(30 * DAY));
    expect(result.audits).toBe(1);
    const ids = db
      .select({ id: audits.id })
      .from(audits)
      .all()
      .map((r) => r.id);
    expect(ids).toEqual([recent]);
    expect(
      db
        .select()
        .from(findings)
        .all()
        .every((f) => f.auditId === recent),
    ).toBe(true);
    expect(db.select().from(findings).all()).toHaveLength(2);
    expect(old).not.toBe(recent);
  });

  it('no deja hallazgos huérfanos ni claves foráneas rotas', () => {
    const { db, audit } = setup();
    for (let i = 0; i < 5; i++) audit(at(i * DAY), i % 2 === 0 ? `c${String(i)}@x.com` : undefined);
    purgeExpired(db, at(40 * DAY));
    expect(db.select().from(audits).all()).toHaveLength(0);
    expect(db.select().from(findings).all()).toHaveLength(0);
    expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
});

describe('purgeExpired: contactos', () => {
  it('borra el contacto 30 días después de su última auditoría', () => {
    const { db, audit } = setup();
    audit(T0, 'dueno@ejemplo.com');
    expect(purgeExpired(db, at(30 * DAY - 1)).leads).toBe(0);
    expect(purgeExpired(db, at(30 * DAY)).leads).toBe(1);
    expect(db.select().from(leads).all()).toHaveLength(0);
  });

  it('si el consultor borró la auditoría, cuenta desde el alta del contacto', () => {
    const { db, audit, repo } = setup();
    const id = audit(T0, 'dueno@ejemplo.com');
    repo.deleteAudit(id);
    expect(purgeExpired(db, at(10 * DAY)).leads).toBe(0);
    expect(purgeExpired(db, at(30 * DAY)).leads).toBe(1);
  });
});

describe('purgeExpired: sesiones', () => {
  it('borra las vencidas por inactividad o por el máximo absoluto y conserva las vigentes', () => {
    const { db, auth } = setup();
    db.insert(users).values({ email: 'c@x.com', passwordHash: 'h', createdAt: T0 }).run();
    auth.createSession({ idHash: 'inactiva', userId: 1, now: T0 });
    auth.createSession({ idHash: 'vigente', userId: 1, now: at(20 * MIN) });
    const result = purgeExpired(db, at(SESSION_IDLE_MS));
    expect(result.sessions).toBe(1);
    expect(db.select({ id: sessions.idHash }).from(sessions).all()).toEqual([{ id: 'vigente' }]);
    expect(purgeExpired(db, at(20 * MIN + SESSION_ABSOLUTE_MS)).sessions).toBe(1);
  });
});

describe('purgeExpired: contadores de ingreso', () => {
  const decay = Math.max(PAIR_POLICY.resetAfterMs, IP_POLICY.resetAfterMs);

  it('respeta el horizonte de decaimiento del ADR 0007 (15 minutos sin fallos)', () => {
    const { db, auth } = setup();
    auth.saveCounter('k', { failures: 3, lastFailureAt: T0.getTime(), lockedUntil: 0 });
    // Justo en el horizonte el contador todavía cuenta para recordFailure: no se borra.
    expect(purgeExpired(db, at(decay)).counters).toBe(0);
    expect(purgeExpired(db, at(decay + 1)).counters).toBe(1);
  });

  it('nunca borra un contador con bloqueo vigente', () => {
    const { db, auth } = setup();
    // Caso límite armado a mano: un bloqueo más largo que el decaimiento.
    auth.saveCounter('k', {
      failures: 9,
      lastFailureAt: T0.getTime(),
      lockedUntil: T0.getTime() + decay + 5 * MIN,
    });
    expect(purgeExpired(db, at(decay + MIN)).counters).toBe(0);
    expect(purgeExpired(db, at(decay + 5 * MIN)).counters).toBe(1);
    expect(db.select().from(loginCounters).all()).toHaveLength(0);
  });
});
