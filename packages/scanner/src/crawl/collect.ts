// Descargas adicionales a la portada: robots.txt, sitemap, favicon y verificación de enlaces.
// Todo pasa por safeFetch y por el planificador compartido de 1 request por segundo por host.
import type { CheerioAPI } from 'cheerio';
import type {
  FaviconState,
  LinkResult,
  LinkSummary,
  RobotsState,
  SecurityTxtState,
  SitemapState,
} from '../audit/context.js';
import type { SafeFetch, SafeFetchOptions, SafeFetchResponse } from '../net/create-safe-fetch.js';
import { isSafeFetchError } from '../net/target-url.js';
import type { HostScheduler } from './host-scheduler.js';
import { isPathAllowed, parseRobots } from './robots.js';

export const MAX_LINKS = 20;
/** Presupuesto solo para la fase de enlaces. */
export const LINK_BUDGET_MS = 25_000;
const MIN_REMAINING_MS = 1_000;
/** Tope del GET de respaldo: alcanza para el estado y unas pocas líneas, nunca 2 MB. */
export const FALLBACK_BODY_BYTES = 8 * 1024;
const ROBOTS_AGENT = 'AuditorWebPyme';

export interface CollectDeps {
  readonly fetch: SafeFetch;
  readonly scheduler: HostScheduler;
  readonly contactUrl: string;
  /** Reloj monotónico en milisegundos. */
  readonly now: () => number;
  readonly timeoutSignal: (ms: number) => AbortSignal;
}

export interface Extras {
  readonly robots: RobotsState;
  readonly sitemap: SitemapState;
  readonly favicon: FaviconState;
  readonly securityTxt: SecurityTxtState;
  readonly links: LinkSummary;
}

/** URL para mostrar: sin query ni fragmento. */
export function displayUrl(url: URL | string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

type Attempt =
  | { readonly ok: true; readonly response: SafeFetchResponse }
  | { readonly ok: false; readonly code: string };

export async function collectExtras(
  primary: SafeFetchResponse,
  html: CheerioAPI | null,
  deps: CollectDeps,
): Promise<Extras> {
  const base = new URL(primary.url);
  const request = async (
    url: string,
    method: 'GET' | 'HEAD',
    signal?: AbortSignal,
    maxBodyBytes?: number,
  ): Promise<Attempt> => {
    const options: SafeFetchOptions = {
      contactUrl: deps.contactUrl,
      method,
      ...(signal === undefined ? {} : { signal }),
      ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    };
    try {
      const response = await deps.scheduler.run(base.host, () => deps.fetch(url, options), signal);
      return { ok: true, response };
    } catch (error) {
      if (isSafeFetchError(error)) return { ok: false, code: error.code };
      if (signal?.aborted === true) return { ok: false, code: 'ABORTED' };
      throw error;
    }
  };

  const robots = await fetchRobots(base, request);
  const sitemap = await resolveSitemap(base, robots, request);
  const favicon = await resolveFavicon(base, html, request);
  const securityTxt = await fetchSecurityTxt(base, request);
  const links = await checkLinks(base, html, robots, request, deps);
  return { robots, sitemap, favicon, securityTxt, links };
}

type Requester = (
  url: string,
  method: 'GET' | 'HEAD',
  signal?: AbortSignal,
  maxBodyBytes?: number,
) => Promise<Attempt>;

async function fetchRobots(base: URL, request: Requester): Promise<RobotsState> {
  const attempt = await request(new URL('/robots.txt', base).href, 'GET');
  if (!attempt.ok) return { kind: 'error', code: attempt.code };
  const { status, headers, body } = attempt.response;
  const contentType = headers['content-type'] ?? '';
  // 4xx: no hay robots.txt (se permite todo). Un "soft 404" con HTML también cuenta como ausente.
  if ((status >= 400 && status < 500) || contentType.includes('html')) return { kind: 'missing' };
  if (status >= 500) return { kind: 'error', code: `HTTP_${String(status)}` };
  return { kind: 'found', robots: parseRobots(body.toString('utf8')) };
}

/** security.txt (RFC 9116): estándar público, se pide con un GET de pocos KB. */
async function fetchSecurityTxt(base: URL, request: Requester): Promise<SecurityTxtState> {
  const url = new URL('/.well-known/security.txt', base).href;
  const attempt = await request(url, 'GET', undefined, FALLBACK_BODY_BYTES);
  if (!attempt.ok) return { kind: 'error', code: attempt.code };
  const { status, headers, body } = attempt.response;
  const contentType = headers['content-type'] ?? '';
  if ((status >= 400 && status < 500) || contentType.includes('html')) return { kind: 'missing' };
  if (status >= 500) return { kind: 'error', code: `HTTP_${String(status)}` };
  return { kind: 'found', hasContact: /^s*contacts*:/im.test(body.toString('utf8')) };
}

async function resolveSitemap(
  base: URL,
  robots: RobotsState,
  request: Requester,
): Promise<SitemapState> {
  const declared =
    robots.kind === 'found' ? robots.robots.sitemaps.filter((u) => URL.canParse(u)) : [];
  if (declared.length > 0) {
    // Declarado en robots.txt: se informa sin descargar (y nunca de otro host).
    return {
      kind: 'declared',
      urls: declared.map(displayUrl),
      otherHost: declared.some((u) => new URL(u).host !== base.host),
    };
  }
  return headState(await request(new URL('/sitemap.xml', base).href, 'HEAD'));
}

async function resolveFavicon(
  base: URL,
  html: CheerioAPI | null,
  request: Requester,
): Promise<FaviconState> {
  const declared =
    html !== null &&
    html('link[rel]')
      .toArray()
      .some((el) => /\b(icon|apple-touch-icon)\b/i.test(html(el).attr('rel') ?? ''));
  if (declared) return { kind: 'declared' };
  return headState(await request(new URL('/favicon.ico', base).href, 'HEAD'));
}

function headState(
  attempt: Attempt,
): { kind: 'found' } | { kind: 'missing' } | { kind: 'error'; code: string } {
  if (!attempt.ok) return { kind: 'error', code: attempt.code };
  const { status } = attempt.response;
  if (status >= 200 && status < 400) return { kind: 'found' };
  if (status >= 400 && status < 500) return { kind: 'missing' };
  return { kind: 'error', code: `HTTP_${String(status)}` };
}

/** Enlaces internos únicos de la portada: sin mailto, tel, anclas, javascript ni externos. */
function internalLinks(base: URL, html: CheerioAPI | null): URL[] {
  if (html === null) return [];
  const seen = new Set<string>([displayUrl(base) + base.search]);
  const links: URL[] = [];
  for (const el of html('a[href]').toArray()) {
    const href = (html(el).attr('href') ?? '').trim();
    if (href === '' || href.startsWith('#') || !URL.canParse(href, base.href)) continue;
    const url = new URL(href, base.href);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.host !== base.host) continue;
    url.hash = '';
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(url);
  }
  return links;
}

function classify(attempt: Attempt, url: URL): LinkResult {
  const shown = displayUrl(url);
  if (!attempt.ok) {
    return {
      url: shown,
      outcome: 'not_verified',
      status: null,
      reason: attempt.code === 'ABORTED' ? 'budget' : 'error',
    };
  }
  const { status } = attempt.response;
  if (status === 405 || status === 501)
    return { url: shown, outcome: 'not_verified', status, reason: 'method' };
  if (status === 401 || status === 403 || status === 429) {
    return { url: shown, outcome: 'not_verified', status, reason: 'auth' };
  }
  if (status >= 400) return { url: shown, outcome: 'broken', status, reason: null };
  return { url: shown, outcome: 'ok', status, reason: null };
}

async function checkLinks(
  base: URL,
  html: CheerioAPI | null,
  robots: RobotsState,
  request: Requester,
  deps: CollectDeps,
): Promise<LinkSummary> {
  const all = internalLinks(base, html);
  const deadline = deps.now() + LINK_BUDGET_MS;
  const results: LinkResult[] = [];
  let budgetExhausted = false;

  for (const url of all.slice(0, MAX_LINKS)) {
    const allowed =
      robots.kind === 'missing' ||
      (robots.kind === 'found' &&
        isPathAllowed(robots.robots, ROBOTS_AGENT, url.pathname + url.search));
    if (!allowed) {
      // Vetado por robots.txt (o robots.txt ilegible): no verificado, nunca roto.
      results.push({
        url: displayUrl(url),
        outcome: 'not_verified',
        status: null,
        reason: 'robots',
      });
      continue;
    }
    const remaining = deadline - deps.now();
    if (remaining < MIN_REMAINING_MS) {
      budgetExhausted = true;
      results.push({
        url: displayUrl(url),
        outcome: 'not_verified',
        status: null,
        reason: 'budget',
      });
      continue;
    }
    // El deadline de cada request se acota a lo que queda del presupuesto.
    let result = classify(
      await request(url.href, 'HEAD', deps.timeoutSignal(Math.floor(remaining))),
      url,
    );
    // Solo si el servidor no acepta HEAD (405/501): GET de respaldo con un tope de pocos KB.
    const left = deadline - deps.now();
    if (result.reason === 'method' && left >= MIN_REMAINING_MS) {
      result = classify(
        await request(url.href, 'GET', deps.timeoutSignal(Math.floor(left)), FALLBACK_BODY_BYTES),
        url,
      );
    }
    results.push(result);
  }
  return { found: all.length, results, budgetExhausted };
}
