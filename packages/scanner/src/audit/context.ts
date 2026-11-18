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

/** Todo lo que necesitan los checks, ya descargado. Los checks no hacen requests. */
export interface AuditContext {
  /** URL normalizada que pidió la persona. */
  readonly url: string;
  readonly now: Date;
  /** Página principal por HTTPS. */
  readonly https: FetchOutcome;
  /** Página principal por HTTP (para SEC-02). */
  readonly http: FetchOutcome;
  /** null si no hubo respuesta HTTPS ni error de certificado. */
  readonly tls: TlsState | null;
  /** Respuesta para revisar cabeceras: HTTPS si respondió; si no, HTTP. */
  readonly primary: SafeFetchResponse | null;
}
