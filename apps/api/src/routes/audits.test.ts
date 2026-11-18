import type { Finding } from '@auditor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { openDatabase } from '../db/client.js';
import { redactUrl } from '../logging.js';

const FINDING: Finding = {
  checkId: 'SEC-07',
  category: 'security',
  status: 'fail',
  severity: 'low',
  title: 'Falta X-Content-Type-Options',
  evidence: null,
  recommendation: 'Agregá la cabecera X-Content-Type-Options: nosniff.',
  effort: 'low',
};

let now = new Date('2026-11-18T12:00:00Z');
let apps: ReturnType<typeof buildApp>[] = [];

function setup(overrides: Partial<AppDeps> = {}) {
  const db = openDatabase(':memory:');
  const app = buildApp({
    db,
    runAudit: () => Promise.resolve({ findings: [FINDING] }),
    now: () => now,
    ...overrides,
  });
  apps.push(app);
  return { app, db };
}

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
  now = new Date('2026-11-18T12:00:00Z');
});

const post = (app: ReturnType<typeof buildApp>, payload: unknown) =>
  app.inject({ method: 'POST', url: '/api/audits', payload: payload as Record<string, unknown> });

describe('POST /api/audits', () => {
  it('normaliza la URL, responde 202 con un token de 256 bits y la auditoría termina', async () => {
    const { app } = setup();
    const res = await post(app, { url: 'Ejemplo.com' });
    expect(res.statusCode).toBe(202);
    const { token } = res.json<{ token: string }>();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await app.auditQueue.idle();
    const view = await app.inject({ method: 'GET', url: `/api/audits/${token}` });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      status: 'done',
      url: 'https://ejemplo.com/',
      error: null,
      findings: [FINDING],
      scores: {
        total: 0,
        band: 'E',
        categories: { security: 0, seo: null, analytics: null, trust: null, performance: null },
        categoriesUsed: 1,
        categoriesTotal: 5,
      },
    });
  });

  it.each([
    [{ url: 'ftp://ejemplo.com' }, 'BLOCKED_SCHEME'],
    [{ url: '127.0.0.1' }, 'BLOCKED_IP'],
    [{ url: 'localhost' }, 'BLOCKED_HOST'],
    [{ url: 'ejemplo.com:22' }, 'BLOCKED_PORT'],
    [{ url: '' }, 'INVALID_INPUT'],
    [{ url: 'ejemplo.com', extra: 1 }, 'INVALID_INPUT'],
    [{}, 'INVALID_INPUT'],
    [{ url: 123 }, 'INVALID_INPUT'],
  ])('rechaza %j con 400 %s y no crea nada', async (payload, code) => {
    const { app } = setup();
    const res = await post(app, payload);
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe(code);
    expect(body.error.message.length).toBeGreaterThan(10);
    expect(app.auditQueue.size).toEqual({ running: 0, pending: 0 });
  });

  it('rechaza cuerpos de más de 2 KB con 413', async () => {
    const { app } = setup();
    const res = await post(app, { url: `ejemplo.com/${'a'.repeat(3000)}` });
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rechaza JSON inválido con 400 sin filtrar detalles internos', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/audits',
      headers: { 'content-type': 'application/json' },
      payload: '{"url":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_INPUT');
  });

  it('responde 503 cuando la cola está llena', async () => {
    const { app } = setup({
      runAudit: () => new Promise(() => undefined),
      queue: { concurrency: 1, maxPending: 1 },
    });
    expect((await post(app, { url: 'uno.com' })).statusCode).toBe(202);
    expect((await post(app, { url: 'dos.com' })).statusCode).toBe(202);
    const res = await post(app, { url: 'tres.com' });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('QUEUE_FULL');
  });
});

describe('GET /api/audits/:token', () => {
  it('muestra queued mientras espera y running mientras corre', async () => {
    let release!: () => void;
    const { app } = setup({
      runAudit: () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ findings: [] });
          };
        }),
      queue: { concurrency: 1, maxPending: 5 },
    });
    const first = (await post(app, { url: 'uno.com' })).json<{ token: string }>().token;
    const second = (await post(app, { url: 'dos.com' })).json<{ token: string }>().token;
    const status = async (t: string) =>
      (await app.inject({ method: 'GET', url: `/api/audits/${t}` })).json<{ status: string }>()
        .status;
    expect(await status(first)).toBe('running');
    const running = await app.inject({ method: 'GET', url: `/api/audits/${first}` });
    expect(running.json<{ scores: unknown }>().scores).toBeNull();
    expect(await status(second)).toBe('queued');
    release();
    await new Promise((r) => setTimeout(r, 10));
    release();
    await app.auditQueue.idle();
    expect(await status(second)).toBe('done');
  });

  it('informa failed con un mensaje claro si el escaneo falla', async () => {
    const error = Object.assign(new Error('x'), { name: 'SafeFetchError', code: 'TIMEOUT' });
    const { app } = setup({ runAudit: () => Promise.reject(error) });
    const { token } = (await post(app, { url: 'lento.com' })).json<{ token: string }>();
    await app.auditQueue.idle();
    const body = (await app.inject({ method: 'GET', url: `/api/audits/${token}` })).json<{
      status: string;
      error: { code: string; message: string };
    }>();
    expect(body.status).toBe('failed');
    expect(body.error.code).toBe('TIMEOUT');
    expect(body.error.message).toMatch(/tardó/);
  });

  it('un error inesperado se informa como INTERNAL_ERROR sin detalles', async () => {
    const { app } = setup({ runAudit: () => Promise.reject(new Error('detalle interno')) });
    const { token } = (await post(app, { url: 'roto.com' })).json<{ token: string }>();
    await app.auditQueue.idle();
    const res = await app.inject({ method: 'GET', url: `/api/audits/${token}` });
    expect(res.json<{ error: { code: string } }>().error.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('detalle interno');
  });

  it('404 para tokens inexistentes o con formato inválido', async () => {
    const { app } = setup();
    for (const token of ['A'.repeat(43), 'corto', `${'A'.repeat(42)}$`]) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/audits/${encodeURIComponent(token)}`,
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('410 cuando el informe venció (30 días)', async () => {
    const { app } = setup();
    const { token } = (await post(app, { url: 'ejemplo.com' })).json<{ token: string }>();
    await app.auditQueue.idle();
    now = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const res = await app.inject({ method: 'GET', url: `/api/audits/${token}` });
    expect(res.statusCode).toBe(410);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXPIRED');
  });

  it('la base guarda solo el hash del token, nunca el token', async () => {
    const { app, db } = setup();
    const { token } = (await post(app, { url: 'ejemplo.com' })).json<{ token: string }>();
    const rows = db.$client.prepare('select * from audits').all();
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe('recuperación al reiniciar', () => {
  it('retoma las auditorías en espera y marca como interrumpidas las que estaban corriendo', async () => {
    const db = openDatabase(':memory:');
    const first = buildApp({
      db,
      runAudit: () => new Promise(() => undefined),
      now: () => now,
      queue: { concurrency: 1, maxPending: 5 },
    });
    const running = (await post(first, { url: 'uno.com' })).json<{ token: string }>().token;
    const queued = (await post(first, { url: 'dos.com' })).json<{ token: string }>().token;

    const second = buildApp({
      db,
      runAudit: () => Promise.resolve({ findings: [] }),
      now: () => now,
    });
    apps.push(second);
    await second.ready();
    await second.auditQueue.idle();
    const status = async (t: string) =>
      (await second.inject({ method: 'GET', url: `/api/audits/${t}` })).json<{
        status: string;
        error: { code: string } | null;
      }>();
    expect(await status(running)).toMatchObject({
      status: 'failed',
      error: { code: 'INTERRUPTED' },
    });
    expect(await status(queued)).toMatchObject({ status: 'done' });
  });
});

describe('logs', () => {
  it('redacta el token de las rutas de informes', () => {
    const token = 'A'.repeat(43);
    expect(redactUrl(`/api/audits/${token}`)).toBe('/api/audits/:token');
    expect(redactUrl(`/informe/${token}?x=1`)).toBe('/informe/:token');
    expect(redactUrl('/api/health')).toBe('/api/health');
  });
});
