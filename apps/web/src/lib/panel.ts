import type { AuditStatus, LeadStatus } from '@auditor/shared';
import { ApiRequestError } from './api-client.js';

export const SESSION_KEY = ['session'] as const;
export const auditsKey = (query: string) => ['admin', 'audits', query] as const;
export const leadsKey = (query: string) => ['admin', 'leads', query] as const;
export const auditDetailKey = (id: string) => ['admin', 'audit', id] as const;

export const AUDIT_STATUS_LABEL: Record<AuditStatus, string> = {
  queued: 'En fila',
  running: 'En curso',
  done: 'Terminada',
  failed: 'Falló',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  proposal: 'Propuesta',
  closed: 'Cerrado',
};

/** Fecha y hora en la zona de Argentina, igual que los filtros del panel. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Sin sesión (o vencida) hay que volver a la pantalla de ingreso. */
export function needsLogin(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/** Los filtros viven en la URL: se pueden compartir y sobreviven a recargar. */
export function filtersFrom(
  params: URLSearchParams,
  names: readonly string[],
): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, params.get(name) ?? '']));
}
