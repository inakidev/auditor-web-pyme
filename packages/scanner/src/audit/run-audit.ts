import { setTimeout as sleepFor } from 'node:timers/promises';
import type { Finding } from '@auditor/shared';
import { load, type CheerioAPI } from 'cheerio';
import type { Check } from '../checks/check.js';
import { makeFinding } from '../checks/check.js';
import { ALL_CHECKS } from '../checks/index.js';
import { collectExtras, type Extras } from '../crawl/collect.js';
import { HostScheduler } from '../crawl/host-scheduler.js';
import type { SafeFetch, SafeFetchResponse } from '../net/create-safe-fetch.js';
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
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly checks?: readonly Check[];
  /** Planificador compartido entre trabajos; si falta, se crea uno para este runner. */
  readonly scheduler?: HostScheduler;
  /** Reloj monotónico en milisegundos. */
  readonly monotonic?: () => number;
  readonly timeoutSignal?: (ms: number) => AbortSignal;
}

/** CLAUDE.md, regla 3: 1 request por segundo por host. */
export const MIN_INTERVAL_MS = 1000;

const NO_EXTRAS: Extras = {
  robots: { kind: 'error', code: 'NO_RESPONSE' },
  sitemap: { kind: 'error', code: 'NO_RESPONSE' },
  favicon: { kind: 'error', code: 'NO_RESPONSE' },
  securityTxt: { kind: 'error', code: 'NO_RESPONSE' },
  links: { found: 0, results: [], budgetExhausted: false },
};

export function createAuditRunner(deps: AuditRunnerDeps) {
  const checks = deps.checks ?? ALL_CHECKS;
  const monotonic = deps.monotonic ?? (() => deps.now().getTime());
  const scheduler =
    deps.scheduler ??
    new HostScheduler({ intervalMs: MIN_INTERVAL_MS, now: monotonic, sleep: deps.sleep });
  const timeoutSignal = deps.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));

  return async function runAudit(url: string, options: RunAuditOptions): Promise<AuditResult> {
    const target = normalizeTargetUrl(url);
    if (!target.ok) throw new SafeFetchError(target.code, 'La URL no pasó la validación previa');

    const home = async (input: string, encoding?: 'gzip-br'): Promise<FetchOutcome> => {
      try {
        const response = await scheduler.run(new URL(input).host, () =>
          deps.fetch(input, {
            contactUrl: options.contactUrl,
            ...(encoding === undefined ? {} : { acceptEncoding: encoding }),
          }),
        );
        return { ok: true, response };
      } catch (error) {
        if (!isSafeFetchError(error)) throw error;
        return { ok: false, code: error.code, detail: error.detail ?? null };
      }
    };

    // La página principal se pide con gzip, br: PER-01 lee Content-Encoding de esta respuesta.
    const https = await home(withScheme(target.url, 'https:'), 'gzip-br');
    const http = await home(withScheme(target.url, 'http:'));
    if (!https.ok && !http.ok) {
      throw new SafeFetchError(https.code, 'No se pudo descargar el sitio', {
        ...(https.detail === null ? {} : { detail: https.detail }),
      });
    }

    const primary = https.ok ? https.response : http.ok ? http.response : null;
    const html = parseHtml(primary);
    const extras =
      primary === null
        ? NO_EXTRAS
        : await collectExtras(primary, html, {
            fetch: deps.fetch,
            scheduler,
            contactUrl: options.contactUrl,
            now: monotonic,
            timeoutSignal,
          });

    const ctx: AuditContext = {
      url: target.url,
      now: deps.now(),
      https,
      http,
      tls: tlsStateOf(https),
      primary,
      html,
      ...extras,
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

/** Parsea con cheerio (parse5). El HTML nunca se ejecuta ni se renderiza. */
function parseHtml(res: SafeFetchResponse | null): CheerioAPI | null {
  if (res === null) return null;
  const contentType = (res.headers['content-type'] ?? '').toLowerCase();
  const body = res.body.toString('utf8');
  const looksHtml = contentType.includes('html') || (contentType === '' && /^\s*</.test(body));
  return looksHtml ? load(body) : null;
}

function tlsStateOf(https: FetchOutcome): TlsState | null {
  if (https.ok) return https.response.tls === null ? null : { valid: true, ...https.response.tls };
  return https.code === 'TLS_ERROR' ? { valid: false, error: https.detail } : null;
}

/** Un check que falla no rompe la auditoría: queda como "no evaluado", fuera del puntaje. */
async function runCheck(check: Check, ctx: AuditContext): Promise<Finding[]> {
  try {
    return await check.run(ctx);
  } catch {
    return [
      makeFinding(
        { id: check.id, category: check.category, severity: 'info' },
        {
          status: 'not_evaluated',
          title: 'No pudimos completar este control',
          recommendation: 'Volvé a intentar la revisión más tarde.',
        },
      ),
    ];
  }
}

/** Planificador de producción, compartido por todas las auditorías del proceso. */
const sharedScheduler = new HostScheduler({
  intervalMs: MIN_INTERVAL_MS,
  now: () => performance.now(),
  sleep: (ms, signal) => sleepFor(ms, undefined, signal === undefined ? {} : { signal }),
});

/** Orquestador de producción: safeFetch real y planificador compartido. */
export const runAudit = createAuditRunner({
  fetch: safeFetch,
  now: () => new Date(),
  sleep: (ms, signal) => sleepFor(ms, undefined, signal === undefined ? {} : { signal }),
  scheduler: sharedScheduler,
  monotonic: () => performance.now(),
});
