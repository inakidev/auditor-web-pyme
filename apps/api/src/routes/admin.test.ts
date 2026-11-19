import type { Finding } from '@auditor/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { audits } from '../db/schema.js';
import { login, testDeps } from '../testing/support.js';

// Lista explícita: toda ruta nueva tiene que figurar en una de las dos (RNF-02).
const PUBLIC_ROUTES = [
  'GET /api/health',
  'POST /api/audits',
  'GET /api/audits/:token',
  'GET /api/auth/csrf',
  'POST /api/auth/login',
];
const ADMIN_ROUTES = [
  'GET /api/auth/session',
  'POST /api/auth/logout',
  'GET /api/admin/audits',
  'GET /api/admin/audits/:id',
  'GET /api/admin/leads',
];

const FINDING: Finding = {
  checkId: 'SEC-07',
  category: 'security',
  status: 'fail',
  severity: 'low',
  title: 'Falta X-Content-Type-Options',
  evidence: null,
  recommendation: 'Agregá la cabecera.',
  effort: 'low',
  guide: null,
};

let now = new Date('2026-11-18T12:00:00Z');
let apps: ReturnType<typeof buildApp>[] = [];

function setup(overrides: Partial<AppDeps> = {}) {
  const deps = testDeps({
    now: () => now,
    runAudit: () => Promise.resolve({ findings: [FINDING] }),
    ...overrides,
  });
  const app = buildApp(deps);
  apps.push(app);
  return { app, db: deps.db };
}

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
  now = new Date('2026-11-18T12:00:00Z');
});

async function createAudit(
  app: ReturnType<typeof buildApp>,
  url: string,
  email?: string,
): Promise<void> {
  const payload = email === undefined ? { url } : { url, email, consent: true };
  const res = await app.inject({ method: 'POST', url: '/api/audits', payload });
  expect(res.statusCode).toBe(202);
}

async function drain(app: ReturnType<typeof buildApp>): Promise<void> {
  await app.auditQueue.idle();
}

describe('clasificación de rutas', () => {
  it('toda ruta registrada es pública o de panel, nunca las dos', async () => {
    const { app } = setup();
    await app.ready();
    const registered = app.registeredRoutes.filter((r) => !r.startsWith('HEAD '));
    for (const route of registered) {
      const inPublic = PUBLIC_ROUTES.includes(route);
      const inAdmin = ADMIN_ROUTES.includes(route);
      expect(inPublic !== inAdmin, `ruta sin clasificar o duplicada: ${route}`).toBe(true);
    }
    expect([...registered].sort()).toEqual([...PUBLIC_ROUTES, ...ADMIN_ROUTES].sort());
  });

  it.each(ADMIN_ROUTES)('%s sin sesión responde 401', async (route) => {
    const { app } = setup();
    const [method = 'GET', path = '/'] = route.split(' ');
    const res = await app.inject({
      method: method as 'GET' | 'POST',
      url: path.replace(':id', '1'),
      headers: { origin: 'https://auditor.example.test', 'x-csrf-token': 'x' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('una ruta inexistente bajo /api/admin también lleva no-store', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/admin/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/admin/audits', () => {
  async function seeded() {
    const ctx = setup();
    await createAudit(ctx.app, 'https://uno.example.com', 'dueno@uno.example.com');
    now = new Date('2026-11-19T12:00:00Z');
    await createAudit(ctx.app, 'https://dos.example.com');
    now = new Date('2026-11-20T12:00:00Z');
    await createAudit(ctx.app, 'https://tres.example.org');
    await drain(ctx.app);
    const session = await login(ctx.app);
    const get = (query = '') =>
      ctx.app.inject({
        method: 'GET',
        url: `/api/admin/audits${query}`,
        headers: { cookie: session.cookie },
      });
    return { ...ctx, get };
  }

  it('lista paginada, más nueva primero', async () => {
    const { get } = await seeded();
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json<{ items: { domain: string; hasLead: boolean }[]; total: number }>();
    expect(body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(body.items.map((i) => i.domain)).toEqual([
      'tres.example.org',
      'dos.example.com',
      'uno.example.com',
    ]);
    expect(body.items[2]).toMatchObject({ hasLead: true, status: 'done', scoreBand: 'E' });
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('pagina con page y pageSize', async () => {
    const { get } = await seeded();
    const body = (await get('?page=2&pageSize=2')).json<{ items: unknown[]; total: number }>();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(3);
  });

  it.each([
    ['?domain=example.com', ['dos.example.com', 'uno.example.com']],
    ['?domain=TRES', ['tres.example.org']],
    ['?from=2026-11-19&to=2026-11-19', ['dos.example.com']],
    ['?status=queued', []],
    [
      '?minScore=0&maxScore=100&status=done',
      ['tres.example.org', 'dos.example.com', 'uno.example.com'],
    ],
    ['?minScore=99', []],
  ])('filtra %s', async (query, domains) => {
    const { get } = await seeded();
    const body = (await get(query)).json<{ items: { domain: string }[] }>();
    expect(body.items.map((i) => i.domain)).toEqual(domains);
  });

  it.each([
    '?pageSize=101',
    '?page=0',
    '?page=1001',
    '?domain=%25',
    '?domain=a_b',
    `?domain=${'a'.repeat(254)}`,
    '?from=ayer',
    '?minScore=101',
    '?status=borrado',
    '?otro=1',
    '?page=1&page=2',
  ])('rechaza %s con 400 sin repetir el valor', async (query) => {
    const { get } = await seeded();
    const res = await get(query);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('borrado');
    expect(res.body).not.toContain('ayer');
  });
});

describe('GET /api/admin/audits/:id', () => {
  it('devuelve el informe completo con el contacto', async () => {
    const { app, db } = setup();
    await createAudit(app, 'https://uno.example.com', 'dueno@uno.example.com');
    await drain(app);
    const { cookie } = await login(app);
    const id = db.select({ id: audits.id }).from(audits).get()?.id ?? 0;
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/audits/${String(id)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: number;
      domain: string;
      audit: { status: string; findings: unknown[] };
      lead: { email: string; consentTextVersion: string } | null;
    }>();
    expect(body).toMatchObject({ id, domain: 'uno.example.com' });
    expect(body.audit.status).toBe('done');
    expect(body.audit.findings).toHaveLength(1);
    expect(body.lead?.email).toBe('dueno@uno.example.com');
  });

  it.each(['999', 'abc', '0', '1.5'])('id %s inexistente o inválido -> 404', async (id) => {
    const { app } = setup();
    const { cookie } = await login(app);
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/audits/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/admin/leads', () => {
  it('lista solo los contactos con consentimiento y su última auditoría', async () => {
    const { app } = setup();
    await createAudit(app, 'https://uno.example.com', 'dueno@uno.example.com');
    await createAudit(app, 'https://dos.example.com');
    await drain(app);
    const { cookie } = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/admin/leads', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Record<string, unknown>[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      email: 'dueno@uno.example.com',
      domain: 'uno.example.com',
      status: 'new',
      lastAuditId: 1,
    });
  });

  it('filtra por estado y rechaza estados desconocidos', async () => {
    const { app } = setup();
    await createAudit(app, 'https://uno.example.com', 'dueno@uno.example.com');
    const { cookie } = await login(app);
    const get = (q: string) =>
      app.inject({ method: 'GET', url: `/api/admin/leads${q}`, headers: { cookie } });
    expect((await get('?status=contacted')).json<{ total: number }>().total).toBe(0);
    expect((await get('?status=new&domain=uno.example.com')).json<{ total: number }>().total).toBe(
      1,
    );
    expect((await get('?status=x')).statusCode).toBe(400);
  });
});
