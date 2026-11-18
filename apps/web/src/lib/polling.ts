import type { AuditView } from '@auditor/shared';
import { ApiRequestError } from './api-client.js';

export const POLL_INTERVAL_MS = 2000;
const MAX_RETRIES = 4;
const MAX_RETRY_DELAY_MS = 30_000;

/** Consulta cada 2 s mientras la auditoría espera o corre; corta en done o failed. */
export function pollInterval(view: AuditView | undefined): number | false {
  return view?.status === 'done' || view?.status === 'failed' ? false : POLL_INTERVAL_MS;
}

/** Sin reintentos si el pedido es inválido, el informe no existe o venció. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && [400, 404, 410].includes(error.status)) return false;
  return failureCount < MAX_RETRIES;
}

/** Espera exponencial entre reintentos: 2 s, 4 s, 8 s… con un tope de 30 s. */
export function retryDelay(attempt: number): number {
  return Math.min(POLL_INTERVAL_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}
