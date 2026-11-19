/** Contador de intentos fallidos (tiempos en ms desde epoch). */
export interface Counter {
  readonly failures: number;
  readonly lastFailureAt: number;
  readonly lockedUntil: number;
}

export interface LockoutPolicy {
  readonly threshold: number;
  /** Sin fallos durante este lapso, el contador vuelve a cero. */
  readonly resetAfterMs: number;
  readonly lockMs: (failures: number) => number;
}

const MINUTE = 60_000;
const MAX_LOCK_MS = 15 * MINUTE;

/** Correo + IP: 5 fallos -> 1 minuto, y se duplica con cada fallo extra hasta 15 minutos. */
export const PAIR_POLICY: LockoutPolicy = {
  threshold: 5,
  resetAfterMs: 15 * MINUTE,
  lockMs: (failures) => Math.min(MINUTE * 2 ** (failures - 5), MAX_LOCK_MS),
};

/** Tope aparte por IP, sin importar el correo: 20 fallos -> 15 minutos. */
export const IP_POLICY: LockoutPolicy = {
  threshold: 20,
  resetAfterMs: 15 * MINUTE,
  lockMs: () => MAX_LOCK_MS,
};

export function recordFailure(
  counter: Counter | undefined,
  now: number,
  policy: LockoutPolicy,
): Counter {
  const stale = counter === undefined || now - counter.lastFailureAt > policy.resetAfterMs;
  const failures = stale ? 1 : counter.failures + 1;
  const lockedUntil =
    failures >= policy.threshold ? now + policy.lockMs(failures) : (counter?.lockedUntil ?? 0);
  return { failures, lastFailureAt: now, lockedUntil };
}

/** Milisegundos de bloqueo que quedan (0 = puede intentar). */
export function lockedFor(counter: Counter | undefined, now: number): number {
  return counter === undefined ? 0 : Math.max(counter.lockedUntil - now, 0);
}
