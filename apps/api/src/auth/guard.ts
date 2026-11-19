import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../errors.js';
import type { ActiveSession, AuthRepository } from '../services/auth.js';
import { hashToken } from '../tokens.js';
import { safeEqual, sessionCsrfToken } from './keys.js';

export const SESSION_COOKIE = '__Host-sid';
export const CSRF_COOKIE = '__Host-csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** __Host-: obliga Secure y Path=/ sin Domain (un subdominio no puede pisarla). */
const HOST_COOKIE: CookieSerializeOptions = { path: '/', secure: true, httpOnly: true };
export const SESSION_COOKIE_OPTIONS: CookieSerializeOptions = { ...HOST_COOKIE, sameSite: 'lax' };
export const CSRF_COOKIE_OPTIONS: CookieSerializeOptions = { ...HOST_COOKIE, sameSite: 'strict' };

declare module 'fastify' {
  interface FastifyRequest {
    session: (ActiveSession & { readonly id: string }) | null;
  }
}

/**
 * Origin tiene que estar y ser exactamente PUBLIC_ORIGIN (nunca se deriva de Host).
 * Capa extra: si el navegador manda Sec-Fetch-Site, tiene que ser same-origin.
 */
export function originAllowed(req: FastifyRequest, publicOrigin: string): boolean {
  const fetchSite = req.headers['sec-fetch-site'];
  return (
    req.headers.origin === publicOrigin && (fetchSite === undefined || fetchSite === 'same-origin')
  );
}

export function headerToken(req: FastifyRequest): string {
  const value = req.headers[CSRF_HEADER];
  return typeof value === 'string' ? value : '';
}

export function createGuards(deps: {
  repo: AuthRepository;
  publicOrigin: string;
  now: () => Date;
}) {
  const { repo, publicOrigin, now } = deps;

  /** onRequest: exige sesión vigente; si no hay, 401 y se borra la cookie. */
  function requireSession(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
    const id = req.cookies[SESSION_COOKIE];
    const session = id === undefined ? undefined : repo.useSession(hashToken(id), now());
    if (id === undefined || session === undefined) {
      if (id !== undefined) reply.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
      void sendError(reply, 401, 'UNAUTHENTICATED');
      return;
    }
    req.session = { ...session, id };
    done();
  }

  /** preHandler de mutaciones con sesión: Origin + token CSRF sincronizado. */
  function requireCsrf(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
    if (!originAllowed(req, publicOrigin)) {
      void sendError(reply, 403, 'FORBIDDEN_ORIGIN');
      return;
    }
    const session = req.session;
    if (session === null || !safeEqual(headerToken(req), sessionCsrfToken(session.id))) {
      void sendError(reply, 403, 'CSRF_FAILED');
      return;
    }
    done();
  }

  return { requireSession, requireCsrf };
}
