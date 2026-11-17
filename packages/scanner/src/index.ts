// API pública del scanner. En runtime solo sale safeFetch; la fábrica con opciones de prueba
// queda interna al paquete.
export { safeFetch } from './net/safe-fetch.js';
export type {
  AcceptEncoding,
  SafeFetch,
  SafeFetchOptions,
  SafeFetchResponse,
} from './net/create-safe-fetch.js';
export type { SafeFetchErrorCode } from './net/errors.js';
