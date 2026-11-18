import type { Finding } from '@auditor/shared';
import type { Check } from '../checks/check.js';
import { makeFinding } from '../checks/check.js';
import { SECURITY_CHECKS } from '../checks/index.js';
import type { SafeFetch } from '../net/create-safe-fetch.js';
import { SafeFetchError } from '../net/errors.js';
import { safeFetch } from '../net/safe-fetch.js';
import { isSafeFetchError, normalizeTargetUrl } from '../net/target-url.js';
import type { AuditContext, FetchOutcome, TlsState } from './context.js';

export interface RunAuditOptions {
  /** URL de contacto para el User-Agent (AUDITOR_CONTACT_URL). */
  readonly contactUrl: string;
}

export interface AuditResult {
  readonly findings: readonly Finding[];
}

export interface AuditRunnerDeps {
  readonly fetch: SafeFetch;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly checks?: readonly Check[];
}

/** CLAUDE.md, regla 3: 1 request por segundo por dominio. */
export const MIN_INTERVAL_MS = 1000;

export function createAuditRunner(deps: AuditRunnerDeps) {
  const checks = deps.checks ?? SECURITY_CHECKS;

  return async function runAudit(url: string, options: RunAuditOptions): Promise<AuditResult> {
    const target = normalizeTargetUrl(url);
    if (!target.ok) throw new SafeFetchError(target.code, 'La URL no pasó la validación previa');

    let lastRequest: number | null = null;
    const throttled = async (input: string, encoding?: 'gzip-br'): Promise<FetchOutcome> => {
      if (lastRequest !== null) {
        const wait = MIN_INTERVAL_MS - (deps.now().getTime() - lastRequest);
        if (wait > 0) await deps.sleep(wait);
      }
      lastRequest = deps.now().getTime();
      try {
        const response = await deps.fetch(input, {
          contactUrl: options.contactUrl,
          ...(encoding === undefined ? {} : { acceptEncoding: encoding }),
        });
        return { ok: true, response };
      } catch (error) {
        if (!isSafeFetchError(error)) throw error;
        return { ok: false, code: error.code, detail: error.detail ?? null };
      }
    };

    // La página principal se pide con gzip, br: PER-01 lee Content-Encoding de esta respuesta.
    const https = await throttled(withScheme(target.url, 'https:'), 'gzip-br');
    const http = await throttled(withScheme(target.url, 'http:'));
    if (!https.ok && !http.ok) {
      throw new SafeFetchError(https.code, 'No se pudo descargar el sitio', {
        ...(https.detail === null ? {} : { detail: https.detail }),
      });
    }

    const ctx: AuditContext = {
      url: target.url,
      now: deps.now(),
      https,
      http,
      tls: tlsStateOf(https),
      primary: https.ok ? https.response : http.ok ? http.response : null,
    };
    const findings = await Promise.all(checks.map((check) => runCheck(check, ctx)));
    return { findings: findings.flat() };
  };
}

function withScheme(url: string, protocol: 'http:' | 'https:'): string {
  const copy = new URL(url);
  copy.protocol = protocol;
  return copy.href;
}

function tlsStateOf(https: FetchOutcome): TlsState | null {
  if (https.ok) return https.response.tls === null ? null : { valid: true, ...https.response.tls };
  return https.code === 'TLS_ERROR' ? { valid: false, error: https.detail } : null;
}

/** Un check que falla no rompe la auditoría: queda como "no aplica". */
async function runCheck(check: Check, ctx: AuditContext): Promise<Finding[]> {
  try {
    return await check.run(ctx);
  } catch {
    return [
      makeFinding(
        { id: check.id, category: check.category, severity: 'info' },
        {
          status: 'na',
          title: 'No pudimos completar este control',
          recommendation: 'Volvé a intentar la revisión más tarde.',
        },
      ),
    ];
  }
}

/** Orquestador de producción: safeFetch real y espera real entre requests. */
export const runAudit = createAuditRunner({
  fetch: safeFetch,
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
