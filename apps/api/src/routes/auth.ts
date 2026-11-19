import { loginRequestSchema, type CsrfView, type SessionView } from '@auditor/shared';
import type { FastifyInstance } from 'fastify';
import {
  CSRF_COOKIE,
  CSRF_COOKIE_OPTIONS,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  headerToken,
  originAllowed,
  type createGuards,
} from '../auth/guard.js';
import { attemptKeys, safeEqual, sessionCsrfToken } from '../auth/keys.js';
import { IP_POLICY, PAIR_POLICY, lockedFor, recordFailure } from '../auth/lockout.js';
import { VerifierBusyError, verifyPassword, type VerifyLimiter } from '../auth/passwords.js';
import { sendError } from '../errors.js';
import { SESSION_ABSOLUTE_MS, type AuthRepository } from '../services/auth.js';
import { generateToken, hashToken } from '../tokens.js';
import { MAX_BODY_BYTES } from './audits.js';

/** El token previo al login dura 10 minutos. */
const CSRF_MAX_AGE_S = 10 * 60;

export interface AuthRoutesDeps {
  readonly repo: AuthRepository;
  readonly guards: ReturnType<typeof createGuards>;
  readonly limiter: VerifyLimiter;
  readonly ipHashSalt: string;
  readonly publicOrigin: string;
  readonly now: () => Date;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { repo, guards, limiter, ipHashSalt, publicOrigin, now } = deps;

  // Doble envío previo al login: el mismo valor va en la cookie y en el JSON.
  app.get('/api/auth/csrf', (_req, reply) => {
    const csrfToken = generateToken();
    reply.setCookie(CSRF_COOKIE, csrfToken, { ...CSRF_COOKIE_OPTIONS, maxAge: CSRF_MAX_AGE_S });
    const body: CsrfView = { csrfToken };
    return reply.send(body);
  });

  app.post('/api/auth/login', { bodyLimit: MAX_BODY_BYTES }, async (req, reply) => {
    if (!originAllowed(req, publicOrigin)) return sendError(reply, 403, 'FORBIDDEN_ORIGIN');
    const cookieToken = req.cookies[CSRF_COOKIE] ?? '';
    if (!safeEqual(cookieToken, headerToken(req))) return sendError(reply, 403, 'CSRF_FAILED');

    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_INPUT');
    const { email, password } = parsed.data;

    // Nunca se registra el correo: solo la clave hasheada del contador.
    const keys = attemptKeys(ipHashSalt, email, req.ip);
    const wait = Math.max(
      lockedFor(repo.getCounter(keys.pair), now().getTime()),
      lockedFor(repo.getCounter(keys.ip), now().getTime()),
    );
    if (wait > 0) {
      req.log.info({ loginKey: keys.pair }, 'ingreso bloqueado');
      reply.header('retry-after', String(Math.ceil(wait / 1000)));
      return sendError(reply, 429, 'LOGIN_LOCKED');
    }

    const user = repo.findUserByEmail(email);
    let ok: boolean;
    try {
      ok = await limiter.run(() => verifyPassword(user?.passwordHash ?? null, password));
    } catch (error) {
      if (error instanceof VerifierBusyError) return sendError(reply, 503, 'LOGIN_BUSY');
      throw error;
    }

    const t = now().getTime();
    if (!ok || user === undefined) {
      repo.saveCounter(keys.pair, recordFailure(repo.getCounter(keys.pair), t, PAIR_POLICY));
      repo.saveCounter(keys.ip, recordFailure(repo.getCounter(keys.ip), t, IP_POLICY));
      req.log.info({ loginKey: keys.pair }, 'ingreso fallido');
      return sendError(reply, 401, 'INVALID_CREDENTIALS');
    }

    repo.deleteCounter(keys.pair);
    // Siempre una sesión nueva: la que viniera en la cookie se descarta (fijación de sesión).
    const previous = req.cookies[SESSION_COOKIE];
    if (previous !== undefined) repo.deleteSession(hashToken(previous));
    const sessionId = generateToken();
    repo.createSession({ idHash: hashToken(sessionId), userId: user.id, now: now() });
    reply.setCookie(SESSION_COOKIE, sessionId, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_ABSOLUTE_MS / 1000,
    });
    reply.clearCookie(CSRF_COOKIE, CSRF_COOKIE_OPTIONS);
    req.log.info({ loginKey: keys.pair }, 'ingreso correcto');
    const body: SessionView = { email: user.email, csrfToken: sessionCsrfToken(sessionId) };
    return reply.send(body);
  });

  app.get('/api/auth/session', { onRequest: guards.requireSession }, (req, reply) => {
    const session = req.session;
    if (session === null) return sendError(reply, 401, 'UNAUTHENTICATED');
    const body: SessionView = { email: session.email, csrfToken: sessionCsrfToken(session.id) };
    return reply.send(body);
  });

  app.post(
    '/api/auth/logout',
    { onRequest: guards.requireSession, preHandler: guards.requireCsrf },
    (req, reply) => {
      if (req.session !== null) repo.deleteSession(hashToken(req.session.id));
      reply.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
      return reply.code(204).send();
    },
  );
}
