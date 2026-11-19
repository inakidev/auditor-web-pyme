import { describe, expect, it } from 'vitest';
import { IP_POLICY, PAIR_POLICY, lockedFor, recordFailure, type Counter } from './lockout.js';

const MIN = 60_000;

function fail(times: number, policy = PAIR_POLICY, start = 0, step = 1000) {
  let counter: Counter | undefined;
  let t = start;
  for (let i = 0; i < times; i++) {
    t = Math.max(t + step, counter?.lockedUntil ?? 0);
    counter = recordFailure(counter, t, policy);
  }
  return { counter, t };
}

describe('bloqueo por correo + IP', () => {
  it('no bloquea con 4 fallos', () => {
    const { counter, t } = fail(4);
    expect(lockedFor(counter, t)).toBe(0);
  });

  it('al quinto fallo bloquea 1 minuto', () => {
    const { counter, t } = fail(5);
    expect(lockedFor(counter, t)).toBe(MIN);
    expect(lockedFor(counter, t + MIN)).toBe(0);
  });

  it('duplica el bloqueo con cada fallo extra hasta 15 minutos', () => {
    expect(lockedFor(fail(6).counter, fail(6).t)).toBe(2 * MIN);
    expect(lockedFor(fail(7).counter, fail(7).t)).toBe(4 * MIN);
    expect(lockedFor(fail(9).counter, fail(9).t)).toBe(15 * MIN);
    expect(lockedFor(fail(20).counter, fail(20).t)).toBe(15 * MIN);
  });

  it('reinicia el contador tras 15 minutos sin fallos', () => {
    const { counter, t } = fail(4);
    const next = recordFailure(counter, t + 15 * MIN + 1, PAIR_POLICY);
    expect(next.failures).toBe(1);
  });

  it('sin contador no hay bloqueo', () => {
    expect(lockedFor(undefined, 0)).toBe(0);
  });
});

describe('tope por IP', () => {
  it('bloquea 15 minutos al llegar a 20 fallos', () => {
    expect(lockedFor(fail(19, IP_POLICY).counter, fail(19, IP_POLICY).t)).toBe(0);
    const { counter, t } = fail(20, IP_POLICY);
    expect(lockedFor(counter, t)).toBe(15 * MIN);
  });
});
