import { describe, expect, it } from 'vitest';
import {
  ARGON2_MIN,
  VerifyLimiter,
  VerifierBusyError,
  hashPassword,
  isAcceptableArgon2idHash,
  verifyPassword,
} from './passwords.js';

describe('hashPassword y verifyPassword', () => {
  it('genera un argon2id con los parámetros mínimos y verifica la contraseña', async () => {
    const hash = await hashPassword('una contraseña de prueba');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(isAcceptableArgon2idHash(hash)).toBe(true);
    expect(await verifyPassword(hash, 'una contraseña de prueba')).toBe(true);
    expect(await verifyPassword(hash, 'otra')).toBe(false);
  });

  it('sin hash (correo inexistente) verifica igual contra uno ficticio y devuelve false', async () => {
    expect(await verifyPassword(null, 'cualquiera')).toBe(false);
  });
});

describe('isAcceptableArgon2idHash', () => {
  const base = `$argon2id$v=19$m=${String(ARGON2_MIN.memoryCost)},t=${String(ARGON2_MIN.timeCost)},p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA`;
  it.each([
    [base, true],
    [base.replace('m=19456', 'm=65536'), true],
    [base.replace('m=19456', 'm=19455'), false],
    [base.replace('t=2', 't=1'), false],
    [base.replace('p=1', 'p=0'), false],
    [base.replace('v=19', 'v=16'), false],
    [base.replace('$argon2id$', '$argon2i$'), false],
    [`${base}$extra`, false],
    ['', false],
  ])('%s -> %s', (hash, expected) => {
    expect(isAcceptableArgon2idHash(hash)).toBe(expected);
  });
});

describe('VerifyLimiter', () => {
  function deferred() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return {
      promise,
      resolve: () => {
        resolve();
      },
    };
  }

  it('corre como máximo 2 a la vez y rechaza si la espera está llena', async () => {
    const limiter = new VerifyLimiter({ concurrency: 2, maxWaiting: 1 });
    const gates = [deferred(), deferred(), deferred()];
    let active = 0;
    let peak = 0;
    const task = (i: number) => async () => {
      active++;
      peak = Math.max(peak, active);
      await gates[i]?.promise;
      active--;
      return i;
    };
    const runs = [0, 1, 2].map((i) => limiter.run(task(i)));
    await expect(limiter.run(task(0))).rejects.toBeInstanceOf(VerifierBusyError);
    for (const gate of gates) gate.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(peak).toBe(2);
  });

  it('libera el lugar aunque la tarea falle', async () => {
    const limiter = new VerifyLimiter({ concurrency: 1, maxWaiting: 0 });
    await expect(limiter.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await limiter.run(() => Promise.resolve(7))).toBe(7);
  });
});
