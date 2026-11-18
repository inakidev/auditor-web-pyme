// Fixtures de contexto para probar los checks sin red.
import type { AuditContext, FetchOutcome, TlsState } from '../../src/audit/context.js';
import type { RedirectHop, SafeFetchResponse, TlsInfo } from '../../src/net/create-safe-fetch.js';

export const NOW = new Date('2026-11-18T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

export function inDays(days: number): string {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

export const GOOD_TLS: TlsInfo = {
  protocol: 'TLSv1.3',
  validFrom: inDays(-30),
  validTo: inDays(90),
  issuer: "Let's Encrypt",
};

export function response(overrides: {
  url: string;
  headers?: Record<string, string | string[]>;
  redirects?: RedirectHop[];
  tls?: TlsInfo | null;
  status?: number;
}): SafeFetchResponse {
  return {
    url: overrides.url,
    status: overrides.status ?? 200,
    headers: overrides.headers ?? {},
    body: Buffer.from('<html></html>'),
    contentEncoding: null,
    redirects: overrides.redirects ?? [],
    address: '8.8.8.8',
    rawBytes: 13,
    timings: { ttfbMs: 200, totalMs: 250 },
    tls:
      overrides.tls === undefined
        ? overrides.url.startsWith('https:')
          ? GOOD_TLS
          : null
        : overrides.tls,
  };
}

export const ok = (res: SafeFetchResponse): FetchOutcome => ({ ok: true, response: res });
export const failed = (code: string, detail: string | null = null): FetchOutcome =>
  ({ ok: false, code, detail }) as FetchOutcome;

/** Contexto de un sitio bien configurado; cada prueba cambia solo lo que le interesa. */
export function context(overrides: Partial<AuditContext> = {}): AuditContext {
  const https = overrides.https ?? ok(response({ url: 'https://ejemplo.com/' }));
  const http =
    overrides.http ??
    ok(
      response({
        url: 'https://ejemplo.com/',
        redirects: [{ url: 'http://ejemplo.com/', status: 301 }],
      }),
    );
  const tls: TlsState | null =
    overrides.tls !== undefined
      ? overrides.tls
      : https.ok && https.response.tls !== null
        ? { valid: true, ...https.response.tls }
        : null;
  const primary =
    overrides.primary !== undefined
      ? overrides.primary
      : https.ok
        ? https.response
        : http.ok
          ? http.response
          : null;
  return {
    url: 'https://ejemplo.com/',
    now: NOW,
    https,
    http,
    tls,
    primary,
    html: overrides.html ?? null,
    robots: overrides.robots ?? { kind: 'missing' },
    sitemap: overrides.sitemap ?? { kind: 'missing' },
    favicon: overrides.favicon ?? { kind: 'declared' },
    links: overrides.links ?? { found: 0, results: [], budgetExhausted: false },
  };
}

/** Respuesta HTTPS con cabeceras dadas, como respuesta principal. */
export function withHeaders(headers: Record<string, string | string[]>): AuditContext {
  return context({ https: ok(response({ url: 'https://ejemplo.com/', headers })) });
}
