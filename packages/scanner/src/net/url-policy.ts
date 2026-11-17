import { SafeFetchError } from './errors.js';

const ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);

export function parseTargetUrl(input: string): URL {
  if (!URL.canParse(input)) throw new SafeFetchError('INVALID_URL', 'La URL no es válida');
  return new URL(input);
}

export function effectivePort(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Esquema, credenciales, puerto y nombres locales. Se aplica en cada salto. */
export function assertAllowedUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('BLOCKED_SCHEME', 'Solo se aceptan direcciones http y https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new SafeFetchError('CREDENTIALS_IN_URL', 'La URL no puede incluir usuario ni contraseña');
  }
  if (!ALLOWED_PORTS.has(effectivePort(url))) {
    throw new SafeFetchError('BLOCKED_PORT', 'Solo se aceptan los puertos 80 y 443');
  }
  const host = url.hostname.replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new SafeFetchError('BLOCKED_HOST', 'No se pueden auditar direcciones locales');
  }
}
