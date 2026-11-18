// API pública del scanner. La fábrica de safeFetch con opciones de prueba queda interna.
export { runAudit } from './audit/run-audit.js';
export { normalizeTargetUrl } from './net/target-url.js';
export { safeFetch } from './net/safe-fetch.js';
export { scoreFindings } from './scoring/score.js';
export type { AuditResult, RunAuditOptions } from './audit/run-audit.js';
export type {
  AcceptEncoding,
  SafeFetch,
  SafeFetchOptions,
  SafeFetchResponse,
} from './net/create-safe-fetch.js';
export type { SafeFetchErrorCode } from './net/errors.js';
export type { TargetUrlResult } from './net/target-url.js';
