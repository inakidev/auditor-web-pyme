import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { FastifyReply } from 'fastify';

/**
 * Sirve la web compilada (un solo contenedor en Render). Sin dependencias: al arrancar se lee
 * `dist` a memoria y se arma una lista blanca exacta de rutas. Nunca se toca el disco por pedido,
 * así que no hay forma de pedir un archivo de fuera de `dist`.
 */

/** CSP del documento HTML. Sin 'unsafe-inline' ni orígenes externos (RNF-03). */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/** Vite pone un hash en el nombre de todo lo que va en /assets/: se puede cachear para siempre. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

interface Asset {
  readonly body: Buffer;
  readonly type: string;
  readonly cacheControl: string;
}

export type Resolution = { kind: 'asset'; asset: Asset } | { kind: 'none' };

export interface WebAssets {
  resolve(rawUrl: string): Resolution;
}

/** Codificaciones que nunca hacen falta en una ruta legítima y sirven para escaparse. */
const SUSPICIOUS_ENCODING = /%(2f|5c|00|25)/i;

export function loadWebAssets(dir: string): WebAssets | null {
  if (!existsSync(join(dir, 'index.html'))) return null;
  const files = new Map<string, Asset>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    const path = `/${relative(dir, absolute).split(sep).join('/')}`;
    files.set(path, {
      body: readFileSync(absolute),
      type: CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      cacheControl: path.startsWith('/assets/') ? IMMUTABLE : 'no-cache',
    });
  }
  const index = files.get('/index.html');
  if (index === undefined) return null;

  return {
    resolve(rawUrl) {
      const path = rawUrl.split(/[?#]/, 1)[0] ?? '';
      if (path === '/api' || path.startsWith('/api/')) return { kind: 'none' };
      if (SUSPICIOUS_ENCODING.test(path)) return { kind: 'none' };
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return { kind: 'none' };
      }
      if (
        !decoded.startsWith('/') ||
        decoded.includes('\\') ||
        decoded.includes('\0') ||
        decoded.split('/').some((segment) => segment === '..' || segment === '.')
      ) {
        return { kind: 'none' };
      }
      const asset = files.get(decoded);
      if (asset !== undefined) return { kind: 'asset', asset };
      // Con extensión es un archivo que no existe: 404, nunca el HTML de la SPA.
      const last = decoded.slice(decoded.lastIndexOf('/') + 1);
      if (last.includes('.')) return { kind: 'none' };
      return { kind: 'asset', asset: index };
    },
  };
}

export function sendAsset(reply: FastifyReply, asset: Asset): FastifyReply {
  return reply
    .code(200)
    .header('content-type', asset.type)
    .header('cache-control', asset.cacheControl)
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', WEB_CSP)
    .send(asset.body);
}
