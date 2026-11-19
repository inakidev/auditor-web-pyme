// Utilidades compartidas por las pruebas de la API. Todo lo de acá es descartable.
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type AppDeps } from '../app.js';
import type { AuthConfig } from '../config.js';
import { openDatabase } from '../db/client.js';

export const TEST_ORIGIN = 'https://auditor.example.test';
export const TEST_EMAIL = 'consultor@agencia.example.test';
/** Contraseña y hash descartables de prueba (argon2id, m=19456, t=2, p=1). */
export const TEST_PASSWORD = 'contraseña-descartable-de-prueba';
export const TEST_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$mjTw+dr2Sn7or4vymPkqiA$yTTupNIC30QzeCeZOSXZ9lIvAE5dnIuN2qOLYJ8hmIM';

export const TEST_AUTH: AuthConfig = {
  admin: { email: TEST_EMAIL, passwordHash: TEST_HASH },
  ipHashSalt: 'sal-descartable-de-prueba-0123456789',
  publicOrigin: TEST_ORIGIN,
};

export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    db: openDatabase(':memory:'),
    runAudit: () => Promise.resolve({ findings: [] }),
    auth: TEST_AUTH,
    ...overrides,
  };
}

type App = ReturnType<typeof buildApp>;

/** Valor de una cookie en Set-Cookie, o undefined. */
export function cookieValue(res: LightMyRequestResponse, name: string): string | undefined {
  return res.cookies.find((c) => c.name === name)?.value;
}

export async function getCsrf(app: App): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/api/auth/csrf' });
  return res.json<{ csrfToken: string }>().csrfToken;
}

export async function loginRequest(
  app: App,
  body: { email: string; password: string } = { email: TEST_EMAIL, password: TEST_PASSWORD },
  remoteAddress = '203.0.113.7',
) {
  const csrf = await getCsrf(app);
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress,
    headers: { origin: TEST_ORIGIN, 'x-csrf-token': csrf, cookie: `__Host-csrf=${csrf}` },
    payload: body,
  });
}

/** Ingresa con el usuario de prueba y devuelve la cookie de sesión y el token CSRF. */
export async function login(app: App): Promise<{ cookie: string; csrfToken: string }> {
  const res = await loginRequest(app);
  if (res.statusCode !== 200) throw new Error(`login falló: ${String(res.statusCode)}`);
  return {
    cookie: `__Host-sid=${cookieValue(res, '__Host-sid') ?? ''}`,
    csrfToken: res.json<{ csrfToken: string }>().csrfToken,
  };
}
