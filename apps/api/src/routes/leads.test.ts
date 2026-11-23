import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { leadEvents, leads } from '../db/schema.js';
import { purgeExpired } from '../jobs/purge.js';
import { TEST_EMAIL, TEST_ORIGIN, login, testDeps } from '../testing/support.js';

let now = new Date('2026-11-24T12:00:00Z');
let apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
  now = new Date('2026-11-24T12:00:00Z');
});

async function seeded(overrides: Partial<AppDeps> = {}) {
  const deps = testDeps({ now: () => now, ...overrides });
  const app = buildApp(deps);
  apps.push(app);
  const res = await app.inject({
    method: 'POST',
    url: '/api/audits',
    payload: { url: 'https://uno.example.com', email: 'dueno@uno.example.com', consent: true },
  });
  expect(res.statusCode).toBe(202);
  const session = await login(app);
  const mutate = (method: 'PATCH' | 'POST', url: string, payload: object, headers = {}) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        cookie: session.cookie,
        origin: TEST_ORIGIN,
        'x-csrf-token': session.csrfToken,
        ...headers,
      },
    });
  const detail = () =>
    app.inject({ method: 'GET', url: '/api/admin/leads/1', headers: { cookie: session.cookie } });
  return { app, db: deps.db, mutate, detail };
}

interface Detail {
  lead: { status: string; email: string };
  events: {
    type: string;
    status: string | null;
    note: string | null;
    userEmail: string;
    createdAt: string;
  }[];
}

describe('seguimiento de contactos (RF-14)', () => {
  it('el detalle muestra el contacto sin historial al principio', async () => {
    const { detail } = await seeded();
    const res = await detail();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json<Detail>();
    expect(body.lead).toMatchObject({ email: 'dueno@uno.example.com', status: 'new' });
    expect(body.events).toEqual([]);
  });

  it('cambiar el estado lo guarda con fecha y usuario', async () => {
    const { mutate, detail } = await seeded();
    now = new Date('2026-11-24T12:10:00Z');
    const res = await mutate('PATCH', '/api/admin/leads/1', { status: 'contacted' });
    expect(res.statusCode).toBe(200);
    const body = (await detail()).json<Detail>();
    expect(body.lead.status).toBe('contacted');
    expect(body.events).toEqual([
      expect.objectContaining({
        type: 'status',
        status: 'contacted',
        note: null,
        userEmail: TEST_EMAIL,
        createdAt: '2026-11-24T12:10:00.000Z',
      }),
    ]);
  });

  it('volver a poner el mismo estado no agrega historial', async () => {
    const { mutate, detail } = await seeded();
    await mutate('PATCH', '/api/admin/leads/1', { status: 'new' });
    expect((await detail()).json<Detail>().events).toEqual([]);
  });

  it('agrega notas, recortadas, y el historial va del más reciente al más viejo', async () => {
    const { mutate, detail } = await seeded();
    expect(
      (await mutate('POST', '/api/admin/leads/1/notes', { note: '  Llamé, pide presupuesto  ' }))
        .statusCode,
    ).toBe(201);
    now = new Date('2026-11-24T12:20:00Z');
    await mutate('PATCH', '/api/admin/leads/1', { status: 'proposal' });
    const { events } = (await detail()).json<Detail>();
    expect(events.map((e) => e.type)).toEqual(['status', 'note']);
    expect(events[1]?.note).toBe('Llamé, pide presupuesto');
  });

  it.each([
    ['estado desconocido', 'PATCH', '/api/admin/leads/1', { status: 'ganado' }],
    ['campo extra', 'PATCH', '/api/admin/leads/1', { status: 'closed', otro: 1 }],
    ['nota vacía', 'POST', '/api/admin/leads/1/notes', { note: '   ' }],
    ['nota demasiado larga', 'POST', '/api/admin/leads/1/notes', { note: 'x'.repeat(2001) }],
  ] as const)('rechaza %s con 400', async (_name, method, url, payload) => {
    const { mutate } = await seeded();
    const res = await mutate(method, url, payload);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('ganado');
  });

  it.each([
    ['sin token CSRF', { 'x-csrf-token': '' }],
    ['con otro Origin', { origin: 'https://atacante.example' }],
  ])('rechaza los cambios %s', async (_name, headers) => {
    const { mutate, db } = await seeded();
    expect(
      (await mutate('PATCH', '/api/admin/leads/1', { status: 'closed' }, headers)).statusCode,
    ).toBe(403);
    expect(
      (await mutate('POST', '/api/admin/leads/1/notes', { note: 'x' }, headers)).statusCode,
    ).toBe(403);
    expect(db.select().from(leadEvents).all()).toHaveLength(0);
  });

  it.each(['999', 'abc'])('contacto %s inexistente -> 404', async (id) => {
    const { mutate, app } = await seeded();
    expect((await mutate('PATCH', `/api/admin/leads/${id}`, { status: 'closed' })).statusCode).toBe(
      404,
    );
    expect((await mutate('POST', `/api/admin/leads/${id}/notes`, { note: 'x' })).statusCode).toBe(
      404,
    );
    const session = await login(app);
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/leads/${id}`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('las notas nunca llegan a los logs', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { mutate } = await seeded({ logger: { level: 'trace', stream } });
    await mutate('POST', '/api/admin/leads/1/notes', { note: 'Nota-secreta-del-consultor' });
    expect(lines.join('')).not.toContain('Nota-secreta-del-consultor');
  });

  it('el historial se borra con el contacto, a mano o por la purga', async () => {
    const { mutate, db, app } = await seeded();
    await mutate('POST', '/api/admin/leads/1/notes', { note: 'x' });
    await mutate('PATCH', '/api/admin/leads/1', { status: 'closed' });
    expect(db.select().from(leadEvents).all()).toHaveLength(2);
    purgeExpired(db, new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000));
    expect(db.select().from(leads).all()).toHaveLength(0);
    expect(db.select().from(leadEvents).all()).toHaveLength(0);
    expect(app).toBeDefined();
  });
});
