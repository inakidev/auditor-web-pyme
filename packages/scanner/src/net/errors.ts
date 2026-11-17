export type SafeFetchErrorCode =
  | 'INVALID_URL'
  | 'INVALID_OPTIONS'
  | 'BLOCKED_SCHEME'
  | 'BLOCKED_PORT'
  | 'BLOCKED_HOST'
  | 'BLOCKED_IP'
  | 'CREDENTIALS_IN_URL'
  | 'DNS_FAILURE'
  | 'TOO_MANY_REDIRECTS'
  | 'INVALID_REDIRECT'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'BODY_TOO_LARGE'
  | 'UNSUPPORTED_ENCODING'
  | 'DECODE_ERROR'
  | 'TLS_ERROR'
  | 'NETWORK_ERROR';

/** Error con código cerrado: la API traduce cada código a un mensaje para el usuario. */
export class SafeFetchError extends Error {
  override readonly name = 'SafeFetchError';

  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.detail = options?.detail;
  }

  /** Código técnico de bajo nivel (por ejemplo, el error TLS de Node). */
  readonly detail: string | undefined;
}
