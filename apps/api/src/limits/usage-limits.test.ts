import { describe, expect, it } from 'vitest';
import { UsageLimiter, normalizeDomainKey, retryAfterSeconds } from './usage-limits.js';

const MIN = 60_000;
const T0 = Date.parse('2026-11-23T15:00:00Z'); // 12:00 en Buenos Aires

function limiter(over: Partial<ConstructorParameters<typeof UsageLimiter>[0]> = {}) {
  return new UsageLimiter({
    perIp: 3,
    windowMinutes: 10,
    domainCooldownSeconds: 30,
    dailyCap: 100,
    maxKeys: 1000,
    ...over,
  });
}

/** Pide y, si pasa, consume: lo que hace la ruta. */
function hit(l: UsageLimiter, ip: string, domain: string, now: number) {
  const verdict = l.check({ ipKey: ip, domain }, now);
  if (verdict.ok) l.commit({ ipKey: ip, domain }, now);
  return verdict;
}

describe('tope por IP', () => {
  it('deja pasar hasta el tope y al siguiente responde con la espera restante', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) expect(hit(l, 'ip-a', `d${String(i)}.com`, T0 + i).ok).toBe(true);
    const blocked = hit(l, 'ip-a', 'otro.com', T0 + 2 * MIN);
    expect(blocked).toEqual({ ok: false, code: 'RATE_LIMITED', retryAfterMs: 8 * MIN });
  });

  it('un 429 no extiende ni reinicia el período', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) hit(l, 'ip-a', `d${String(i)}.com`, T0);
    for (let i = 1; i <= 5; i++) expect(hit(l, 'ip-a', 'x.com', T0 + i * MIN).ok).toBe(false);
    // El período arrancó en T0: a los 10 minutos se reinicia, sin importar los rechazos.
    expect(hit(l, 'ip-a', 'x.com', T0 + 10 * MIN).ok).toBe(true);
  });

  it('cada IP tiene su propio contador', () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) hit(l, 'ip-a', `d${String(i)}.com`, T0);
    expect(hit(l, 'ip-b', 'z.com', T0).ok).toBe(true);
  });

  it('un pedido rechazado por otro motivo no consume el tope de la IP', () => {
    const l = limiter();
    hit(l, 'ip-a', 'mismo.com', T0);
    for (let i = 0; i < 5; i++) expect(hit(l, 'ip-a', 'mismo.com', T0 + 1).ok).toBe(false);
    expect(hit(l, 'ip-a', 'otro.com', T0 + 2).ok).toBe(true);
    expect(hit(l, 'ip-a', 'tercero.com', T0 + 3).ok).toBe(true);
  });
});

describe('cooldown por dominio', () => {
  it('bloquea el mismo dominio durante la espera, aunque venga de otra IP', () => {
    const l = limiter();
    hit(l, 'ip-a', 'ejemplo.com', T0);
    expect(hit(l, 'ip-b', 'ejemplo.com', T0 + 10_000)).toEqual({
      ok: false,
      code: 'DOMAIN_COOLDOWN',
      retryAfterMs: 20_000,
    });
    expect(hit(l, 'ip-b', 'ejemplo.com', T0 + 30_000).ok).toBe(true);
  });

  it('con 0 segundos no hay espera', () => {
    const l = limiter({ domainCooldownSeconds: 0 });
    expect(hit(l, 'ip-a', 'ejemplo.com', T0).ok).toBe(true);
    expect(hit(l, 'ip-a', 'ejemplo.com', T0).ok).toBe(true);
  });

  it.each([
    ['Ejemplo.COM', 'ejemplo.com'],
    ['ejemplo.com.', 'ejemplo.com'],
    ['bücher.example', 'xn--bcher-kva.example'],
    ['XN--BCHER-KVA.example.', 'xn--bcher-kva.example'],
  ])('normaliza %s como %s', (host, key) => {
    expect(normalizeDomainKey(host)).toBe(key);
  });

  it('variantes del mismo host comparten la espera', () => {
    const l = limiter();
    hit(l, 'ip-a', 'bücher.example', T0);
    expect(hit(l, 'ip-b', 'XN--BCHER-KVA.example.', T0 + 1).ok).toBe(false);
  });
});

describe('tope diario', () => {
  it('corta a la medianoche de Buenos Aires', () => {
    const l = limiter({ dailyCap: 2, perIp: 100, domainCooldownSeconds: 0 });
    hit(l, 'a', 'a.com', T0);
    hit(l, 'b', 'b.com', T0);
    const blocked = hit(l, 'c', 'c.com', T0);
    // 12:00 en Buenos Aires: faltan 12 horas para la medianoche local.
    expect(blocked).toEqual({ ok: false, code: 'DAILY_CAP', retryAfterMs: 12 * 60 * MIN });
    // 23:59 de Buenos Aires (02:59 UTC del día siguiente) sigue siendo el mismo día.
    expect(hit(l, 'c', 'c.com', Date.parse('2026-11-24T02:59:00Z')).ok).toBe(false);
    expect(hit(l, 'c', 'c.com', Date.parse('2026-11-24T03:00:00Z')).ok).toBe(true);
  });
});

describe('memoria acotada (falla cerrado)', () => {
  it('al llenarse descarta primero las claves vencidas', () => {
    const l = limiter({ maxKeys: 2, domainCooldownSeconds: 0 });
    hit(l, 'ip-1', 'a.com', T0);
    hit(l, 'ip-2', 'a.com', T0);
    expect(hit(l, 'ip-3', 'a.com', T0 + 10 * MIN).ok).toBe(true);
  });

  it('si sigue lleno, las claves nuevas reciben SERVICE_BUSY y las vigentes no se pierden', () => {
    const l = limiter({ maxKeys: 2, domainCooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) hit(l, 'ip-1', 'a.com', T0);
    hit(l, 'ip-2', 'a.com', T0);
    const busy = hit(l, 'ip-3', 'a.com', T0 + MIN);
    expect(busy).toEqual({ ok: false, code: 'SERVICE_BUSY', retryAfterMs: 9 * MIN });
    // ip-1 sigue bloqueada: nadie puede reiniciar su contador llenando el mapa.
    expect(hit(l, 'ip-1', 'a.com', T0 + MIN)).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
    // Una clave que ya existe sigue funcionando.
    expect(hit(l, 'ip-2', 'a.com', T0 + MIN).ok).toBe(true);
  });

  it('lo mismo con el mapa de dominios', () => {
    const l = limiter({ maxKeys: 1, perIp: 100 });
    hit(l, 'ip-1', 'a.com', T0);
    expect(hit(l, 'ip-1', 'b.com', T0 + 1)).toMatchObject({ ok: false, code: 'SERVICE_BUSY' });
  });
});

describe('retryAfterSeconds', () => {
  it.each([
    [1, 1],
    [999, 1],
    [1000, 1],
    [1001, 2],
    [0, 1],
  ])('%i ms -> %i s', (ms, s) => {
    expect(retryAfterSeconds(ms)).toBe(s);
  });
});
