import { count, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { loginCounters, sessions, users } from '../db/schema.js';
import type { Counter } from '../auth/lockout.js';

/** Sesión: 30 minutos de inactividad y 8 horas como máximo absoluto. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
/** El último uso se actualiza como mucho una vez por minuto (menos escrituras). */
const TOUCH_EVERY_MS = 60 * 1000;

export interface ActiveSession {
  readonly userId: number;
  readonly email: string;
}

export function createAuthRepository(db: Db) {
  return {
    /** Crea el primer usuario solo si la tabla está vacía; nunca pisa una contraseña existente. */
    ensureFirstUser(admin: { email: string; passwordHash: string }, now: Date): boolean {
      return db.transaction((tx) => {
        const existing = tx.select({ n: count() }).from(users).get()?.n ?? 0;
        if (existing > 0) return false;
        tx.insert(users)
          .values({ ...admin, createdAt: now })
          .run();
        return true;
      });
    },

    findUserByEmail(email: string) {
      return db.select().from(users).where(eq(users.email, email)).get();
    },

    createSession(input: { idHash: string; userId: number; now: Date }): void {
      db.insert(sessions)
        .values({
          idHash: input.idHash,
          userId: input.userId,
          createdAt: input.now,
          lastSeenAt: input.now,
          expiresAt: new Date(input.now.getTime() + SESSION_ABSOLUTE_MS),
        })
        .run();
    },

    /** Devuelve la sesión vigente y renueva su último uso; si venció, la borra. */
    useSession(idHash: string, now: Date): ActiveSession | undefined {
      const row = db
        .select({
          userId: sessions.userId,
          email: users.email,
          lastSeenAt: sessions.lastSeenAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.idHash, idHash))
        .get();
      if (row === undefined) return undefined;
      const t = now.getTime();
      if (t >= row.expiresAt.getTime() || t - row.lastSeenAt.getTime() >= SESSION_IDLE_MS) {
        this.deleteSession(idHash);
        return undefined;
      }
      if (t - row.lastSeenAt.getTime() >= TOUCH_EVERY_MS) {
        db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.idHash, idHash)).run();
      }
      return { userId: row.userId, email: row.email };
    },

    deleteSession(idHash: string): void {
      db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    },

    getCounter(key: string): Counter | undefined {
      return db
        .select({
          failures: loginCounters.failures,
          lastFailureAt: loginCounters.lastFailureAt,
          lockedUntil: loginCounters.lockedUntil,
        })
        .from(loginCounters)
        .where(eq(loginCounters.key, key))
        .get();
    },

    saveCounter(key: string, counter: Counter): void {
      db.insert(loginCounters)
        .values({ key, ...counter })
        .onConflictDoUpdate({ target: loginCounters.key, set: counter })
        .run();
    },

    deleteCounter(key: string): void {
      db.delete(loginCounters).where(eq(loginCounters.key, key)).run();
    },
    // La purga periódica de sesiones y contadores vencidos llega en H14.
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
