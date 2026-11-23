import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { leads } from '../db/schema.js';
import { testDeps } from '../testing/support.js';

const MIN = 60_000;
let now = new Date('2026-11-23T15:00:00Z');
let apps: ReturnType<typeof buildApp>[] = [];

const LIMITS = {
  perIp: 3,
  windowMinutes: 10,
  domainCooldownSeconds: 30,
  dailyCap: 100,
  concurrency: 2,
  maxPending: 50,
};

function setup(overrides: Partial<AppDeps> = {}) {
  const deps = testDeps({ now: () => now, limits: LIMITS, ...overrides });
  const app = buildApp(deps);
  apps.push(app);
  return { app, db: deps.db };
}

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
  now = new Date('2026-11-23T15:00:00Z');
});

type App = ReturnType<typeof buildApp>;
const post = (app: App, payload: object, extra: { remoteAddress?: string; xff?: string } = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/audits',
    payload,
    remoteAddress: extra.remoteAddress ?? '203.0.113.7',
    headers: extra.xff === undefined ? {} : { 'x-forwarded-for': extra.xff },
  });
const code = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

describe('límites de POST /api/audits', () => {
  it('al llegar al tope por IP responde 429 con Retry-After en segundos enteros', async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i++) {
      expect((await post(app, { url: `sitio${String(i)}.com` })).statusCode).toBe(202);
    }
    now = new Date(now.getTime() + 90_500);
    const res = await post(app, { url: 'otro.com' });
    expect(res.statusCode).toBe(429);
    expect(code(res)).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBe('510'); // 10 min - 90,5 s, hacia arriba
  });

  it('el contador se reinicia al terminar el período', async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i++) await post(app, { url: `sitio${String(i)}.com` });
    expect((await post(app, { url: 'otro.com' })).statusCode).toBe(429);
    now = new Date(now.getTime() + 10 * MIN);
    expect((await post(app, { url: 'otro.com' })).statusCode).toBe(202);
  });

  it('los pedidos inválidos no gastan el cupo', async () => {
    const { app } = setup();
    for (let i = 0; i < 5; i++) expect((await post(app, { url: '' })).statusCode).toBe(400);
    expect((await post(app, { url: 'sitio.com' })).statusCode).toBe(202);
  });

  it('el mismo dominio espera el cooldown, aunque se escriba distinto', async () => {
    const { app } = setup();
    expect((await post(app, { url: 'https://Ejemplo.com/' })).statusCode).toBe(202);
    const res = await post(app, { url: 'ejemplo.com.' }, { remoteAddress: '198.51.100.9' });
    expect(res.statusCode).toBe(429);
    expect(code(res)).toBe('DOMAIN_COOLDOWN');
    expect(res.headers['retry-after']).toBe('30');
  });

  it('el tope diario avisa que corta a la medianoche de Buenos Aires', async () => {
    const { app } = setup({ limits: { ...LIMITS, dailyCap: 1 } });
    await post(app, { url: 'uno.com' });
    const res = await post(app, { url: 'dos.com' }, { remoteAddress: '198.51.100.9' });
    expect(res.statusCode).toBe(429);
    expect(code(res)).toBe('DAILY_CAP');
    expect(res.json<{ error: { message: string } }>().error.message).toContain('Buenos Aires');
  });

  it('las IPv6 del mismo /64 comparten cupo', async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i++) {
      await post(
        app,
        { url: `s${String(i)}.com` },
        { remoteAddress: `2001:db8:1:2::${String(i + 1)}` },
      );
    }
    const res = await post(app, { url: 'x.com' }, { remoteAddress: '2001:db8:1:2:ffff::1' });
    expect(res.statusCode).toBe(429);
  });
});

describe('IP detrás del proxy', () => {
  it('con un salto de confianza cuenta por la IP que agrega el proxy, no por lo que manda el cliente', async () => {
    const { app } = setup({ trustProxyHops: 1 });
    const proxy = '10.0.0.1';
    for (let i = 0; i < 3; i++) {
      // El atacante cambia la primera entrada en cada pedido: no le sirve.
      const xff = `1.1.1.${String(i)}, 203.0.113.50`;
      await post(app, { url: `s${String(i)}.com` }, { remoteAddress: proxy, xff });
    }
    const res = await post(
      app,
      { url: 'x.com' },
      { remoteAddress: proxy, xff: '9.9.9.9, 203.0.113.50' },
    );
    expect(res.statusCode).toBe(429);
    // Otro cliente real, detrás del mismo proxy, tiene su propio cupo.
    const other = await post(app, { url: 'y.com' }, { remoteAddress: proxy, xff: '198.51.100.20' });
    expect(other.statusCode).toBe(202);
  });

  it('sin proxy de confianza ignora X-Forwarded-For', async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i++) {
      await post(app, { url: `s${String(i)}.com` }, { xff: `198.51.100.${String(i)}` });
    }
    expect((await post(app, { url: 'x.com' }, { xff: '198.51.100.99' })).statusCode).toBe(429);
  });
});

describe('captura de correos', () => {
  it('apagada: rechaza el correo sin guardar nada y acepta el pedido sin correo', async () => {
    const { app, db } = setup({ contactCaptureEnabled: false });
    const res = await post(app, { url: 'sitio.com', email: 'a@b.com', consent: true });
    expect(res.statusCode).toBe(400);
    expect(code(res)).toBe('CONTACT_DISABLED');
    expect(res.body).not.toContain('a@b.com');
    expect(db.select().from(leads).all()).toHaveLength(0);
    expect((await post(app, { url: 'sitio.com' })).statusCode).toBe(202);
  });

  it('GET /api/config informa la captura y el aviso de demo', async () => {
    const { app } = setup({ contactCaptureEnabled: false, demoNotice: true });
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ contactCapture: false, demoNotice: true });
  });
});

describe('GET /api/health', () => {
  it('responde 200 sin cookies ni Origin, no lo frenan los límites y no escribe en el log', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { app } = setup({ logger: { level: 'trace', stream } });
    for (let i = 0; i < 4; i++) await post(app, { url: `s${String(i)}.com` });
    lines.length = 0;
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/health',
        remoteAddress: '203.0.113.7',
      });
      expect(res.statusCode).toBe(200);
    }
    expect(lines.filter((l) => l.includes('/api/health'))).toEqual([]);
    expect(lines).toEqual([]);
  });
});

describe('diagnóstico de la cadena de proxies (LOG_PROXY_CHAIN)', () => {
  it('registra cuántas entradas trae X-Forwarded-For, nunca las IP', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { app } = setup({
      logger: { level: 'info', stream },
      logProxyChain: true,
      trustProxyHops: 1,
    });
    await post(
      app,
      { url: 'sitio.com' },
      { remoteAddress: '10.0.0.1', xff: '198.51.100.7, 203.0.113.50' },
    );
    const out = lines.join('');
    expect(out).toContain('"xffEntries":2');
    expect(out).toContain('"trustProxyHops":1');
    for (const ip of ['198.51.100.7', '203.0.113.50', '10.0.0.1']) expect(out).not.toContain(ip);
  });
});
