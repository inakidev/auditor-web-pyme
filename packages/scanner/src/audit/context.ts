import type { CheerioAPI } from 'cheerio';
import type { ParsedRobots } from '../crawl/robots.js';
import type { SafeFetchResponse, TlsInfo } from '../net/create-safe-fetch.js';
import type { SafeFetchErrorCode } from '../net/errors.js';

export type FetchOutcome =
  | { readonly ok: true; readonly response: SafeFetchResponse }
  | { readonly ok: false; readonly code: SafeFetchErrorCode; readonly detail: string | null };

/**
 * Estado TLS de la página principal. Si la verificación falla se guarda el código de Node
 * (por ejemplo CERT_HAS_EXPIRED); nunca se reintenta con la verificación apagada.
 */
export type TlsState =
  ({ readonly valid: true } & TlsInfo) | { readonly valid: false; readonly error: string | null };

export type RobotsState =
  | { readonly kind: 'found'; readonly robots: ParsedRobots }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error'; readonly code: string };

export type SitemapState =
  | { readonly kind: 'declared'; readonly urls: readonly string[]; readonly otherHost: boolean }
  | { readonly kind: 'found' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error'; readonly code: string };

export type FaviconState =
  | { readonly kind: 'declared' }
  | { readonly kind: 'found' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error'; readonly code: string };

export interface LinkResult {
  /** URL sin query ni fragmento (para mostrar). */
  readonly url: string;
  readonly outcome: 'ok' | 'broken' | 'not_verified';
  readonly status: number | null;
  readonly reason: 'robots' | 'budget' | 'method' | 'auth' | 'error' | null;
}

export interface LinkSummary {
  /** Enlaces internos únicos encontrados en la portada. */
  readonly found: number;
  readonly results: readonly LinkResult[];
  readonly budgetExhausted: boolean;
}

/** Todo lo que necesitan los checks, ya descargado. Los checks no hacen requests. */
export interface AuditContext {
  /** URL normalizada que pidió la persona. */
  readonly url: string;
  readonly now: Date;
  /** Página principal por HTTPS (pedida con gzip, br). */
  readonly https: FetchOutcome;
  /** Página principal por HTTP (para SEC-02). */
  readonly http: FetchOutcome;
  /** null si no hubo respuesta HTTPS ni error de certificado. */
  readonly tls: TlsState | null;
  /** Respuesta para revisar cabeceras y contenido: HTTPS si respondió; si no, HTTP. */
  readonly primary: SafeFetchResponse | null;
  /** HTML de la respuesta principal, parseado con cheerio (nunca se ejecuta). */
  readonly html: CheerioAPI | null;
  readonly robots: RobotsState;
  readonly sitemap: SitemapState;
  readonly favicon: FaviconState;
  readonly links: LinkSummary;
}
