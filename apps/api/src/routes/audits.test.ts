import type { Finding } from '@auditor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { openDatabase } from '../db/client.js';
import { redactUrl } from '../logging.js';
import { Writable } from 'node:stream';
import { CONSENT_TEXT_VERSION } from '@auditor/shared';

const FINDING: Finding = {
  checkId: 'SEC-07',
  category: 'security',
  status: 'fail',
  severity: 'low',
  title: 'Falta X-Content-Type-Options',
  evidence: null,
  recommendation: 'Agregá la cabecera X-Content-Type-Options: nosniff.',
  effort: 'low',
  guide: null,
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

describe('contacto con consentimiento (H11)', () => {
  const EMAIL = 'persona@empresa.com.ar';
  const count = (db: ReturnType<typeof openDatabase>, table: string) =>
    (db.$client.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

  it('sin consentimiento no guarda el correo ni crea la auditoría', async () => {
    const { app, db } = setup();
    for (const payload of [
      { url: 'ejemplo.com', email: EMAIL },
      { url: 'ejemplo.com', email: EMAIL, consent: false },
    ]) {
      const res = await post(app, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CONSENT_REQUIRED');
      expect(res.body).not.toContain(EMAIL);
    }
    expect(count(db, 'leads')).toBe(0);
    expect(count(db, 'audits')).toBe(0);
  });

  it('con consentimiento guarda el contacto con fecha y versión del texto aceptado', async () => {
    const { app, db } = setup();
    const res = await post(app, {
      url: 'ejemplo.com',
      email: '  Persona@Empresa.com.AR ',
      consent: true,
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).not.toContain('empresa');
    const lead = db.$client.prepare('select * from leads').get() as Record<string, unknown>;
    expect(lead).toMatchObject({
      email: EMAIL,
      domain: 'ejemplo.com',
      status: 'new',
      consent_text_version: CONSENT_TEXT_VERSION,
      consent_at: now.getTime(),
    });
    const audit = db.$client.prepare('select lead_id from audits').get() as { lead_id: number };
    expect(audit.lead_id).toBe(lead['id']);
    const { token } = res.json<{ token: string }>();
    const view = await app.inject({ method: 'GET', url: `/api/audits/${token}` });
    expect(view.body).not.toContain(EMAIL);
  });

  it('el consentimiento sin correo se ignora (no crea contacto)', async () => {
    const { app, db } = setup();
    expect((await post(app, { url: 'ejemplo.com', consent: true })).statusCode).toBe(202);
    expect(count(db, 'leads')).toBe(0);
  });

  it('un correo inválido da 400 sin repetir el valor recibido', async () => {
    const { app } = setup();
    for (const email of ['no-es-correo', `${'a'.repeat(250)}@x.com`, '<script>@x.com']) {
      const res = await post(app, { url: 'ejemplo.com', email, consent: true });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_INPUT');
      expect(res.body).not.toContain(email.slice(0, 10));
    }
  });

  it('los logs nunca muestran el correo', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { app } = setup({ logger: { level: 'trace', stream } });
    await post(app, { url: 'ejemplo.com', email: EMAIL, consent: true });
    await app.auditQueue.idle();
    app.log.info({ req: { body: { email: EMAIL } } }, 'prueba de redacción');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(EMAIL);
  });
});

describe('fases (pantalla P2)', () => {
  it('mientras corre devuelve la fase actual; al terminar, null', async () => {
    let release!: () => void;
    const { app } = setup({
      runAudit: (_url, onPhase) => {
        onPhase('seo');
        return new Promise((resolve) => {
          release = () => {
            resolve({ findings: [] });
          };
        });
      },
    });
    const { token } = (await post(app, { url: 'ejemplo.com' })).json<{ token: string }>();
    const view = async () =>
      (await app.inject({ method: 'GET', url: `/api/audits/${token}` })).json<{
        status: string;
        phase: string | null;
      }>();
    expect(await view()).toMatchObject({ status: 'running', phase: 'seo' });
    release();
    await app.auditQueue.idle();
    expect(await view()).toMatchObject({ status: 'done', phase: null });
  });
});

describe('cabeceras de seguridad (helmet)', () => {
  it('las respuestas de la API llevan CSP estricta, nosniff y no-referrer', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
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
