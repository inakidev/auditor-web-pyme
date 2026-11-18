import { MAX_URL_LENGTH } from '@auditor/shared';
import { SafeFetchError, type SafeFetchErrorCode } from './errors.js';
import { ipLiteralOf, isPublicIp } from './ip-policy.js';
import { assertAllowedUrl, parseTargetUrl } from './url-policy.js';

export type TargetUrlResult =
  | { readonly ok: true; readonly url: string; readonly domain: string }
  | { readonly ok: false; readonly code: SafeFetchErrorCode };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const NON_WEB_SCHEME = /^(file|javascript|data|mailto|tel):/i;

/**
 * Validación previa sin red (RF-01): normaliza `ejemplo.com` a `https://ejemplo.com/` y rechaza
 * lo que safeFetch rechazaría sin consultar DNS. La validación definitiva la hace safeFetch.
 */
export function normalizeTargetUrl(input: string): TargetUrlResult {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed.length > MAX_URL_LENGTH) return { ok: false, code: 'INVALID_URL' };
  const candidate =
    HAS_SCHEME.test(trimmed) || NON_WEB_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = parseTargetUrl(candidate);
    assertAllowedUrl(url);
    const literal = ipLiteralOf(url.hostname);
    if (literal !== null && !isPublicIp(literal)) return { ok: false, code: 'BLOCKED_IP' };
    if (literal === null && !url.hostname.replace(/\.$/, '').includes('.')) {
      return { ok: false, code: 'BLOCKED_HOST' };
    }
    url.hash = '';
    return { ok: true, url: url.href, domain: url.hostname };
  } catch (error) {
    if (error instanceof SafeFetchError) return { ok: false, code: error.code };
    throw error;
  }
}

/** Para la API: un SafeFetchError se identifica por nombre y código (no se exporta la clase). */
export function isSafeFetchError(error: unknown): error is SafeFetchError {
  return error instanceof Error && error.name === 'SafeFetchError' && 'code' in error;
}
