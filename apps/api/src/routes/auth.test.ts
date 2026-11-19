import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../app.js';
import { hashPassword } from '../auth/passwords.js';
import { sessions, users } from '../db/schema.js';
import { hashToken } from '../tokens.js';
import {
  TEST_AUTH,
  TEST_EMAIL,
  TEST_ORIGIN,
  TEST_PASSWORD,
  cookieValue,
  getCsrf,
  login,
  loginRequest,
  testDeps,
} from '../testing/support.js';

const MIN = 60_000;
let now = new Date('2026-11-18T12:00:00Z');
let apps: ReturnType<typeof buildApp>[] = [];

function setup(overrides: Partial<AppDeps> = {}) {
  const deps = testDeps({ now: () => now, ...overrides });
  const app = buildApp(deps);
  apps.push(app);
  return { app, db: deps.db };
}

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
  now = new Date('2026-11-18T12:00:00Z');
});

function setCookie(res: { headers: Record<string, unknown> }, name: string): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [String(raw)];
  return list.find((c) => c.startsWith(`${name}=`)) ?? '';
}

const wrongPassword = { email: TEST_EMAIL, password: 'incorrecta' };

describe('GET /api/auth/csrf', () => {
  it('devuelve el token y lo pone en la cookie __Host-csrf con atributos estrictos', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/auth/csrf' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { csrfToken } = res.json<{ csrfToken: string }>();
    expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieValue(res, '__Host-csrf')).toBe(csrfToken);
    const cookie = setCookie(res, '__Host-csrf');
    for (const attr of ['Max-Age=600', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict']) {
      expect(cookie).toContain(attr);
    }
    expect(cookie).not.toContain('Domain');
  });
});

describe('POST /api/auth/login', () => {
  it('con credenciales correctas crea la sesión y borra la cookie CSRF previa', async () => {
    const { app, db } = setup();
    const res = await loginRequest(app);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json<{ email: string; csrfToken: string }>();
    expect(body.email).toBe(TEST_EMAIL);

    const sid = cookieValue(res, '__Host-sid') ?? '';
    expect(sid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = setCookie(res, '__Host-sid');
    for (const attr of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
      expect(cookie).toContain(attr);
    }
    expect(setCookie(res, '__Host-csrf')).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

    // En la base solo queda el hash del id.
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idHash).toBe(hashToken(sid));
    expect(JSON.stringify(rows)).not.toContain(sid);
    expect(body.csrfToken).not.toBe(sid);
  });

  it('acepta el correo con mayúsculas y espacios', async () => {
    const { app } = setup();
    const res = await loginRequest(app, {
      email: ' Consultor@Agencia.Example.TEST ',
      password: TEST_PASSWORD,
    });
    expect(res.statusCode).toBe(200);
  });

  it('contraseña incorrecta y correo inexistente responden igual', async () => {
    const { app } = setup();
    const bad = await loginRequest(app, wrongPassword);
    const missing = await loginRequest(app, { email: 'nadie@agencia.example.test', password: 'x' });
    expect(bad.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(bad.json()).toEqual(missing.json());
    expect(bad.json<{ error: { code: string } }>().error.code).toBe('INVALID_CREDENTIALS');
    expect(cookieValue(bad, '__Host-sid')).toBeUndefined();
  });

  it('un cuerpo inválido responde 400 sin repetir lo recibido', async () => {
    const { app } = setup();
    const res = await loginRequest(app, { email: 'no-es-correo<script>', password: 'x' });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('no-es-correo');
  });

  it('descarta una sesión anterior que venga en la cookie (fijación de sesión)', async () => {
    const { app, db } = setup();
    const first = await login(app);
    const csrf = await getCsrf(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: TEST_ORIGIN,
        'x-csrf-token': csrf,
        cookie: `__Host-csrf=${csrf}; ${first.cookie}`,
      },
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(`__Host-sid=${cookieValue(res, '__Host-sid') ?? ''}`).not.toBe(first.cookie);
  });

  describe('Origin y CSRF', () => {
    async function attempt(
      app: ReturnType<typeof buildApp>,
      headers: Record<string, string>,
      withCookie = true,
    ) {
      const csrf = await getCsrf(app);
      return app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          'x-csrf-token': csrf,
          ...(withCookie ? { cookie: `__Host-csrf=${csrf}` } : {}),
          ...headers,
        },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
    }

    it.each([
      ['sin Origin', {}],
      ['con Origin ajeno', { origin: 'https://atacante.example' }],
      ['con Origin parecido', { origin: `${TEST_ORIGIN}.atacante.example` }],
      ['con Origin null', { origin: 'null' }],
      ['con Sec-Fetch-Site cross-site', { origin: TEST_ORIGIN, 'sec-fetch-site': 'cross-site' }],
    ])('rechaza el ingreso %s', async (_name, headers) => {
      const { app } = setup();
      const res = await attempt(app, headers);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN_ORIGIN');
    });

    it('acepta Sec-Fetch-Site same-origin junto al Origin correcto', async () => {
      const { app } = setup();
      const res = await attempt(app, { origin: TEST_ORIGIN, 'sec-fetch-site': 'same-origin' });
      expect(res.statusCode).toBe(200);
    });

    it('rechaza sin cookie CSRF', async () => {
      const { app } = setup();
      const res = await attempt(app, { origin: TEST_ORIGIN }, false);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CSRF_FAILED');
    });

    it('rechaza si la cabecera no coincide con la cookie', async () => {
      const { app } = setup();
      const res = await attempt(app, { origin: TEST_ORIGIN, 'x-csrf-token': 'otro-valor' });
      expect(res.statusCode).toBe(403);
    });

    it('rechaza sin cabecera CSRF', async () => {
      const { app } = setup();
      const csrf = await getCsrf(app);
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: TEST_ORIGIN, cookie: `__Host-csrf=${csrf}` },
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('bloqueo progresivo', () => {
    it('tras 5 fallos bloquea 1 minuto aunque la contraseña sea correcta', async () => {
      const { app } = setup();
      for (let i = 0; i < 5; i++)
        expect((await loginRequest(app, wrongPassword)).statusCode).toBe(401);
      const locked = await loginRequest(app);
      expect(locked.statusCode).toBe(429);
      expect(locked.headers['retry-after']).toBe('60');
      expect(locked.json<{ error: { code: string } }>().error.code).toBe('LOGIN_LOCKED');

      now = new Date(now.getTime() + MIN);
      expect((await loginRequest(app)).statusCode).toBe(200);
    });

    it('un ingreso correcto reinicia el contador de correo + IP', async () => {
      const { app } = setup();
      for (let i = 0; i < 4; i++) await loginRequest(app, wrongPassword);
      expect((await loginRequest(app)).statusCode).toBe(200);
      for (let i = 0; i < 4; i++) await loginRequest(app, wrongPassword);
      expect((await loginRequest(app)).statusCode).toBe(200);
    });

    it('cuenta también los correos inexistentes', async () => {
      const { app } = setup();
      const ghost = { email: 'nadie@agencia.example.test', password: 'x' };
      for (let i = 0; i < 5; i++) await loginRequest(app, ghost);
      expect((await loginRequest(app, ghost)).statusCode).toBe(429);
    });

    it('el bloqueo es por IP: otra IP puede ingresar', async () => {
      const { app } = setup();
      for (let i = 0; i < 5; i++) await loginRequest(app, wrongPassword);
      expect((await loginRequest(app, undefined, '198.51.100.20')).statusCode).toBe(200);
    });

    it('las IPv6 del mismo /64 comparten el bloqueo', async () => {
      const { app } = setup();
      for (let i = 0; i < 5; i++) {
        await loginRequest(app, wrongPassword, `2001:db8:1:2::${String(i + 1)}`);
      }
      expect((await loginRequest(app, undefined, '2001:db8:1:2:ffff::9')).statusCode).toBe(429);
      expect((await loginRequest(app, undefined, '2001:db8:1:3::1')).statusCode).toBe(200);
    });

    it('tope por IP: 20 fallos con correos distintos bloquean cualquier correo', async () => {
      const { app } = setup();
      for (let i = 0; i < 20; i++) {
        await loginRequest(app, { email: `x${String(i)}@agencia.example.test`, password: 'x' });
      }
      expect((await loginRequest(app)).statusCode).toBe(429);
      now = new Date(now.getTime() + 15 * MIN);
      expect((await loginRequest(app)).statusCode).toBe(200);
    });
  });

  it('con las verificaciones argon2 ocupadas responde 503 en lugar de encolar sin límite', async () => {
    const { app } = setup({ verifyLimiter: { concurrency: 1, maxWaiting: 0 } });
    const [a, b] = await Promise.all([loginRequest(app), loginRequest(app)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 503]);
    const busy = a.statusCode === 503 ? a : b;
    expect(busy.json<{ error: { code: string } }>().error.code).toBe('LOGIN_BUSY');
  });
});

describe('sesión', () => {
  it('GET /api/auth/session sin cookie responde 401', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');
  });

  it('con sesión devuelve el correo y el mismo token CSRF del ingreso', async () => {
    const { app } = setup();
    const { cookie, csrfToken } = await login(app);
    const res = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: TEST_EMAIL, csrfToken });
  });

  it('una cookie inventada responde 401', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: '__Host-sid=inventada' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('vence a los 30 minutos sin uso, borra la fila y la cookie', async () => {
    const { app, db } = setup();
    const { cookie } = await login(app);
    now = new Date(now.getTime() + 30 * MIN);
    const res = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.statusCode).toBe(401);
    expect(setCookie(res, '__Host-sid')).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it('el uso la mantiene viva, pero vence a las 8 horas igual', async () => {
    const { app } = setup();
    const { cookie } = await login(app);
    for (let i = 0; i < 16; i++) {
      now = new Date(now.getTime() + 29 * MIN);
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
    }
    now = new Date(now.getTime() + 20 * MIN); // 8 h 4 min desde el ingreso
    const res = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('con token CSRF y Origin correctos cierra la sesión', async () => {
    const { app, db } = setup();
    const { cookie, csrfToken } = await login(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, origin: TEST_ORIGIN, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(204);
    expect(setCookie(res, '__Host-sid')).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    expect(db.select().from(sessions).all()).toHaveLength(0);
    const after = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it.each([
    ['sin token CSRF', () => ({ origin: TEST_ORIGIN }), 'CSRF_FAILED'],
    [
      'con token de otra sesión',
      () => ({ origin: TEST_ORIGIN, 'x-csrf-token': 'x'.repeat(43) }),
      'CSRF_FAILED',
    ],
    ['sin Origin', (t: string) => ({ 'x-csrf-token': t }), 'FORBIDDEN_ORIGIN'],
  ])('rechaza el cierre %s', async (_name, headersFor, code) => {
    const { app, db } = setup();
    const { cookie, csrfToken } = await login(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, ...headersFor(csrfToken) },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(code);
    expect(db.select().from(sessions).all()).toHaveLength(1);
  });

  it('sin sesión responde 401', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: TEST_ORIGIN, 'x-csrf-token': 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('primer usuario', () => {
  it('se crea al arrancar si no hay ninguno', async () => {
    const { app, db } = setup();
    await app.ready();
    expect(db.select({ email: users.email }).from(users).all()).toEqual([{ email: TEST_EMAIL }]);
  });

  it('nunca pisa una contraseña existente', async () => {
    const { app, db } = setup();
    await app.ready();
    const otherHash = await hashPassword('otra-contraseña-descartable');
    const second = buildApp({
      db,
      runAudit: () => Promise.resolve({ findings: [] }),
      auth: { ...TEST_AUTH, admin: { email: TEST_EMAIL, passwordHash: otherHash } },
    });
    apps.push(second);
    await second.ready();
    const row = db.select().from(users).where(eq(users.email, TEST_EMAIL)).get();
    expect(row?.passwordHash).not.toBe(otherHash);
    expect((await loginRequest(second)).statusCode).toBe(200);
  });

  it('sin configuración no crea ninguno', async () => {
    const { app, db } = setup({ auth: { ...TEST_AUTH, admin: null } });
    await app.ready();
    expect(db.select().from(users).all()).toHaveLength(0);
  });
});

describe('logs de autenticación', () => {
  it('no registran correo, cookies, token CSRF ni IP; sí la clave hasheada', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const { app } = setup({ logger: { level: 'trace', stream } });
    const csrf = await getCsrf(app);
    await loginRequest(app, wrongPassword, '203.0.113.99');
    const ok = await login(app);
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: ok.cookie, origin: TEST_ORIGIN, 'x-csrf-token': ok.csrfToken },
    });
    // Defensa extra: aunque alguien loguee cabeceras a mano, pino las oculta.
    app.log.info(
      {
        request: { headers: { cookie: ok.cookie, 'x-csrf-token': ok.csrfToken } },
        response: { headers: { 'set-cookie': ok.cookie } },
      },
      'prueba de redacción',
    );
    const out = lines.join('');
    expect(out).toContain('loginKey');
    expect(out).toContain('ingreso fallido');
    for (const secret of [
      TEST_EMAIL,
      'incorrecta',
      TEST_PASSWORD,
      csrf,
      ok.cookie.split('=')[1] ?? 'x',
      ok.csrfToken,
      '203.0.113',
      '127.0.0.1',
      'remoteAddress',
    ]) {
      expect(out).not.toContain(secret);
    }
  });
});
