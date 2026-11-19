// Fábrica interna de safeFetch. NO se exporta desde el paquete: las opciones de prueba
// (testEndpoint, ca, timeoutMs) solo existen acá y el camino de producción no las usa.
import type { LookupAddress } from 'node:dns';
import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import https, { type RequestOptions } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { SafeFetchError } from './errors.js';
import { ipLiteralOf, isPublicIp } from './ip-policy.js';
import { assertAllowedUrl, effectivePort, parseTargetUrl } from './url-policy.js';

export const TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_REDIRECTS = 3;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/** Tipo cerrado: el valor nunca sale de la URL ni de datos del usuario. */
const ACCEPT_ENCODINGS = { identity: 'identity', 'gzip-br': 'gzip, br' } as const;
export type AcceptEncoding = keyof typeof ACCEPT_ENCODINGS;

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/** Devuelve todas las IP de un nombre. Inyectable para probar sin red. */
export type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

export interface SafeFetchOptions {
  /** URL de contacto para el User-Agent (AUDITOR_CONTACT_URL). */
  readonly contactUrl: string;
  readonly method?: 'GET' | 'HEAD';
  readonly acceptEncoding?: AcceptEncoding;
  readonly signal?: AbortSignal;
  /**
   * Solo puede bajar el tope de descarga (por ejemplo, el GET de respaldo de los enlaces).
   * Nunca viene de datos del usuario. Valores inválidos o mayores a 2 MB usan el tope normal.
   */
  readonly maxBodyBytes?: number;
}

export interface SafeFetchResponse {
  /** URL final, después de seguir las redirecciones. */
  readonly url: string;
  readonly status: number;
  readonly headers: Readonly<IncomingHttpHeaders>;
  /** Cuerpo ya descomprimido, como máximo MAX_BODY_BYTES. */
  readonly body: Buffer;
  /** Content-Encoding que mandó el servidor (lo usa PER-01). */
  readonly contentEncoding: string | null;
  /** Saltos que redirigieron, en orden, con su código (SEC-02). */
  readonly redirects: readonly RedirectHop[];
  /** Datos TLS del último salto si fue HTTPS (SEC-03 y SEC-04). */
  readonly tls: TlsInfo | null;
  /** Bytes recibidos antes de descomprimir (PER-03). */
  readonly rawBytes: number;
  /** Tiempos de toda la llamada con reloj monotónico, medidos desde nuestro servidor (PER-02). */
  readonly timings: { readonly ttfbMs: number; readonly totalMs: number };
  /** IP validada a la que se conectó en el último salto. */
  readonly address: string;
}

export interface RedirectHop {
  readonly url: string;
  readonly status: number;
}

export interface TlsInfo {
  /** Versión negociada, por ejemplo TLSv1.3. */
  readonly protocol: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly issuer: string | null;
}

export type SafeFetch = (input: string, options: SafeFetchOptions) => Promise<SafeFetchResponse>;

export interface SafeFetchDeps {
  readonly resolver: Resolver;
  /** Solo pruebas: dirige la conexión a un servidor local después de validar la IP pública. */
  readonly testEndpoint?: (
    validatedIp: string,
    port: number,
  ) => { readonly host: string; readonly port: number };
  /** Solo pruebas: CA adicional de confianza. No desactiva ninguna verificación. */
  readonly ca?: string | Buffer;
  /** Solo pruebas: timeout global más corto. */
  readonly timeoutMs?: number;
}

export function createSafeFetch(deps: SafeFetchDeps): SafeFetch {
  return async function safeFetch(input, options) {
    const started = performance.now();
    const request = buildRequestSettings(options);
    const timeout = AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS);
    const signal =
      options.signal === undefined ? timeout : AbortSignal.any([timeout, options.signal]);

    try {
      let url = parseTargetUrl(input);
      const redirects: RedirectHop[] = [];
      for (;;) {
        const hop = await fetchHop(url, request, deps, signal, started);
        if (hop.kind === 'final') return { ...hop.response, redirects };
        if (redirects.length === MAX_REDIRECTS) {
          throw new SafeFetchError('TOO_MANY_REDIRECTS', 'Demasiadas redirecciones (máximo 3)');
        }
        redirects.push({ url: url.href, status: hop.status });
        url = resolveRedirect(hop.location, url);
      }
    } catch (error) {
      throw toSafeFetchError(error, timeout, options.signal);
    }
  };
}

interface RequestSettings {
  readonly method: 'GET' | 'HEAD';
  readonly userAgent: string;
  readonly acceptEncoding: string;
  readonly maxBodyBytes: number;
}

/** Math.min(pedido, 2 MB) con un entero positivo; cualquier otro valor usa el tope normal. */
export function effectiveMaxBody(requested: number | undefined): number {
  return requested !== undefined && Number.isInteger(requested) && requested > 0
    ? Math.min(requested, MAX_BODY_BYTES)
    : MAX_BODY_BYTES;
}

function buildRequestSettings(options: SafeFetchOptions): RequestSettings {
  const { contactUrl } = options;
  if (!/^[\x21-\x7e]+$/.test(contactUrl) || !URL.canParse(contactUrl)) {
    throw new SafeFetchError('INVALID_OPTIONS', 'La URL de contacto del User-Agent no es válida');
  }
  const encodingKey: string = options.acceptEncoding ?? 'identity';
  if (!Object.hasOwn(ACCEPT_ENCODINGS, encodingKey)) {
    throw new SafeFetchError('INVALID_OPTIONS', 'acceptEncoding no permitido');
  }
  const method: string = options.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    throw new SafeFetchError('INVALID_OPTIONS', 'Solo se permiten GET y HEAD');
  }
  return {
    method,
    userAgent: `AuditorWebPyme/1.0 (+${contactUrl})`,
    acceptEncoding: ACCEPT_ENCODINGS[encodingKey as AcceptEncoding],
    maxBodyBytes: effectiveMaxBody(options.maxBodyBytes),
  };
}

type Hop =
  | { readonly kind: 'redirect'; readonly location: string; readonly status: number }
  | { readonly kind: 'final'; readonly response: Omit<SafeFetchResponse, 'redirects'> };

/** Un salto: validar URL e IP, conectar a la IP validada y leer la respuesta con topes. */
async function fetchHop(
  url: URL,
  settings: RequestSettings,
  deps: SafeFetchDeps,
  signal: AbortSignal,
  started: number,
): Promise<Hop> {
  assertAllowedUrl(url);
  const literal = ipLiteralOf(url.hostname);
  const addresses =
    literal === null ? await resolveAll(url.hostname, deps, signal) : [literalAddress(literal)];
  const first = addresses[0] as ResolvedAddress;
  const endpoint = deps.testEndpoint?.(first.address, effectivePort(url));

  const options: RequestOptions = {
    method: settings.method,
    host: literal ?? url.hostname,
    port: endpoint?.port ?? effectivePort(url),
    path: `${url.pathname}${url.search}`,
    headers: {
      host: url.host,
      'user-agent': settings.userAgent,
      accept: ACCEPT,
      'accept-encoding': settings.acceptEncoding,
      connection: 'close',
    },
    agent: false,
    signal,
  };
  if (literal === null) {
    options.lookup = pinnedLookup(url.hostname, addresses, endpoint?.host);
    if (url.protocol === 'https:') options.servername = url.hostname;
  } else if (endpoint !== undefined) {
    options.host = endpoint.host;
  }
  if (deps.ca !== undefined) options.ca = deps.ca;

  const res = await sendRequest(url.protocol === 'https:' ? https : http, options);
  const status = res.statusCode ?? 0;
  const location = res.headers.location;
  if (REDIRECT_STATUSES.has(status) && location !== undefined) {
    res.destroy();
    return { kind: 'redirect', location, status };
  }
  const ttfbMs = performance.now() - started;
  const tls = url.protocol === 'https:' ? tlsInfoOf(res) : null;

  const contentEncoding = res.headers['content-encoding']?.trim().toLowerCase() ?? null;
  const { body, rawBytes } = await readBody(res, contentEncoding, settings, signal);
  return {
    kind: 'final',
    response: {
      url: url.href,
      status,
      headers: res.headers,
      body,
      contentEncoding,
      address: first.address,
      tls,
      rawBytes,
      timings: { ttfbMs, totalMs: performance.now() - started },
    },
  };
}

function isoDate(value: string | undefined): string | null {
  return value === undefined || Number.isNaN(Date.parse(value))
    ? null
    : new Date(value).toISOString();
}

/** Lee versión y certificado de la conexión ya verificada (nunca se reintenta sin verificar). */
function tlsInfoOf(res: IncomingMessage): TlsInfo | null {
  const socket = res.socket as Partial<TLSSocket> | null;
  if (
    typeof socket?.getPeerCertificate !== 'function' ||
    typeof socket.getProtocol !== 'function'
  ) {
    return null;
  }
  const cert = socket.getPeerCertificate();
  // Sin certificado, Node devuelve un objeto vacío aunque los tipos digan lo contrario.
  const issuerInfo = cert.issuer as Partial<typeof cert.issuer> | undefined;
  const issuer: unknown = issuerInfo?.O ?? issuerInfo?.CN;
  return {
    protocol: socket.getProtocol(),
    validFrom: isoDate(cert.valid_from),
    validTo: isoDate(cert.valid_to),
    issuer: typeof issuer === 'string' ? issuer : null,
  };
}

function literalAddress(ip: string): ResolvedAddress {
  if (!isPublicIp(ip)) throw new SafeFetchError('BLOCKED_IP', 'La dirección IP no es pública');
  return { address: ip, family: isIP(ip) === 6 ? 6 : 4 };
}

/** Resuelve todas las IP y rechaza si alguna no es pública. */
async function resolveAll(
  hostname: string,
  deps: SafeFetchDeps,
  signal: AbortSignal,
): Promise<readonly ResolvedAddress[]> {
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await abortable(deps.resolver(hostname), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SafeFetchError('DNS_FAILURE', 'No se pudo resolver el dominio', { cause: error });
  }
  if (addresses.length === 0) {
    throw new SafeFetchError('DNS_FAILURE', 'El dominio no tiene direcciones IP');
  }
  if (addresses.some((a) => !isPublicIp(a.address))) {
    throw new SafeFetchError('BLOCKED_IP', 'El dominio apunta a una dirección no pública');
  }
  return addresses;
}

/**
 * Lookup anclado: no vuelve a consultar DNS, devuelve solo las IP ya validadas (revalidándolas)
 * y soporta all:true, que Node usa para probar IPv4 e IPv6 en paralelo.
 */
function pinnedLookup(
  hostname: string,
  addresses: readonly ResolvedAddress[],
  testHost: string | undefined,
): LookupFunction {
  return (requested, lookupOptions, callback) => {
    if (requested !== hostname) {
      callback(new SafeFetchError('BLOCKED_HOST', 'Lookup para un host inesperado'), '', 4);
      return;
    }
    if (addresses.some((a) => !isPublicIp(a.address))) {
      callback(new SafeFetchError('BLOCKED_IP', 'Dirección no pública en el lookup'), '', 4);
      return;
    }
    const dial: LookupAddress[] = addresses.map((a) =>
      testHost === undefined
        ? { address: a.address, family: a.family }
        : { address: testHost, family: 4 },
    );
    const first = dial[0] as LookupAddress;
    if (lookupOptions.all === true) callback(null, dial);
    else callback(null, first.address, first.family);
  };
}

function sendRequest(
  client: typeof http | typeof https,
  options: RequestOptions,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = client.request(options, resolve);
    req.on('error', reject);
    req.end();
  });
}

function resolveRedirect(location: string, base: URL): URL {
  if (!URL.canParse(location, base.href)) {
    throw new SafeFetchError('INVALID_REDIRECT', 'La redirección apunta a una URL inválida');
  }
  return new URL(location, base);
}

/** Transform que corta el flujo al superar el tope de bytes. */
function byteLimit(max: number, counter: { bytes: number } = { bytes: 0 }): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      counter.bytes += chunk.length;
      const seen = counter.bytes;
      if (seen > max) {
        callback(new SafeFetchError('BODY_TOO_LARGE', 'La respuesta supera el tope de descarga'));
      } else {
        callback(null, chunk);
      }
    },
  });
}

function decoderFor(encoding: string | null): Transform | null {
  switch (encoding) {
    case null:
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
      return createBrotliDecompress();
    default:
      throw new SafeFetchError('UNSUPPORTED_ENCODING', 'Codificación de contenido no soportada');
  }
}

/** Lee el cuerpo con tope sobre bytes reales y, si hay compresión, sobre bytes descomprimidos. */
async function readBody(
  res: IncomingMessage,
  encoding: string | null,
  settings: Pick<RequestSettings, 'method' | 'maxBodyBytes'>,
  signal: AbortSignal,
): Promise<{ body: Buffer; rawBytes: number }> {
  const { method, maxBodyBytes } = settings;
  if (method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304) {
    res.destroy();
    return { body: Buffer.alloc(0), rawBytes: 0 };
  }
  let decoder: Transform | null;
  try {
    decoder = decoderFor(encoding);
  } catch (error) {
    res.destroy();
    throw error;
  }
  const raw = { bytes: 0 };
  const chunks: Buffer[] = [];
  const collect = async (source: AsyncIterable<Buffer>) => {
    for await (const chunk of source) chunks.push(chunk);
  };
  if (decoder === null) {
    await pipeline(res, byteLimit(maxBodyBytes, raw), collect, { signal });
  } else {
    await pipeline(res, byteLimit(maxBodyBytes, raw), decoder, byteLimit(maxBodyBytes), collect, {
      signal,
    });
  }
  return { body: Buffer.concat(chunks), rawBytes: raw.bytes };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Abortado', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Códigos de verificación de OpenSSL y errores TLS de Node. */
const TLS_ERROR_CODE =
  /CERT|^UNABLE_TO_|^ERR_TLS_|^ERR_SSL_|^(INVALID_CA|INVALID_PURPOSE|PATH_LENGTH_EXCEEDED|HOSTNAME_MISMATCH)$/;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function toSafeFetchError(
  error: unknown,
  timeout: AbortSignal,
  external?: AbortSignal,
): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  if (timeout.aborted) {
    return new SafeFetchError('TIMEOUT', 'El sitio tardó demasiado en responder', { cause: error });
  }
  if (external?.aborted === true) {
    return new SafeFetchError('ABORTED', 'La descarga se canceló', { cause: error });
  }
  const code = errorCode(error);
  if (code !== undefined && TLS_ERROR_CODE.test(code)) {
    return new SafeFetchError('TLS_ERROR', 'El certificado del sitio no es válido', {
      cause: error,
      detail: code,
    });
  }
  if (code?.startsWith('Z_') === true) {
    return new SafeFetchError('DECODE_ERROR', 'No se pudo descomprimir la respuesta', {
      cause: error,
      detail: code,
    });
  }
  return new SafeFetchError('NETWORK_ERROR', 'No se pudo conectar con el sitio', {
    cause: error,
    ...(code === undefined ? {} : { detail: code }),
  });
}
