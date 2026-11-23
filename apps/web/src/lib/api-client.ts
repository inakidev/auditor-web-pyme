// Único lugar de la web que usa fetch: habla solo con nuestra propia API (mismo origen).
import type {
  AdminLeadDetail,
  LeadStatus,
  AdminAuditDetail,
  AdminAuditItem,
  AdminLeadItem,
  ApiError,
  AuditView,
  CreateAuditResponse,
  CsrfView,
  Page,
  PublicConfig,
  SessionView,
} from '@auditor/shared';

export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE =
  'No pudimos comunicarnos con el servidor. Revisá tu conexión y probá de nuevo.';
const GENERIC_MESSAGE = 'Algo salió mal. Probá de nuevo en unos minutos.';

function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

async function request<T>(path: string, init: RequestInit = {}, csrfToken?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(csrfToken === undefined ? {} : { 'x-csrf-token': csrfToken }),
      },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', NETWORK_MESSAGE);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message } = isApiError(body)
      ? body.error
      : { code: 'UNKNOWN', message: GENERIC_MESSAGE };
    throw new ApiRequestError(res.status, code, message);
  }
  return body as T;
}

/** El correo y el consentimiento solo viajan si la persona escribió un correo. */
export function createAudit(
  url: string,
  contact?: { readonly email: string; readonly consent: boolean },
): Promise<CreateAuditResponse> {
  const email = contact?.email.trim() ?? '';
  const body = email === '' ? { url } : { url, email, consent: contact?.consent === true };
  return request('/api/audits', { method: 'POST', body: JSON.stringify(body) });
}

export function getAudit(token: string): Promise<AuditView> {
  return request(`/api/audits/${encodeURIComponent(token)}`);
}

/** Qué muestra la portada: aviso de demo y si se puede dejar el correo. */
export function getPublicConfig(): Promise<PublicConfig> {
  return request('/api/config');
}

// --- Panel de consultores ---

/** Token del doble envío previo al login (la cookie la pone la API). */
export function getCsrfToken(): Promise<CsrfView> {
  return request('/api/auth/csrf');
}

export function login(email: string, password: string, csrfToken: string): Promise<SessionView> {
  return request(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    csrfToken,
  );
}

export function getSession(): Promise<SessionView> {
  return request('/api/auth/session');
}

export async function logout(csrfToken: string): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' }, csrfToken);
}

/** Solo viajan los filtros con valor. */
export function toQueryString(filters: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''));
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export function listAdminAudits(
  filters: Readonly<Record<string, string>>,
): Promise<Page<AdminAuditItem>> {
  return request(`/api/admin/audits${toQueryString(filters)}`);
}

export function getAdminAudit(id: string): Promise<AdminAuditDetail> {
  return request(`/api/admin/audits/${encodeURIComponent(id)}`);
}

export function listAdminLeads(
  filters: Readonly<Record<string, string>>,
): Promise<Page<AdminLeadItem>> {
  return request(`/api/admin/leads${toQueryString(filters)}`);
}

/** Borrado manual (RF-16): exige el token CSRF de la sesión. */
export async function deleteAdminAudit(id: number, csrfToken: string): Promise<void> {
  await request(`/api/admin/audits/${String(id)}`, { method: 'DELETE' }, csrfToken);
}

export async function deleteAdminLead(id: number, csrfToken: string): Promise<void> {
  await request(`/api/admin/leads/${String(id)}`, { method: 'DELETE' }, csrfToken);
}

/** Seguimiento de contactos (RF-14). */
export function getAdminLead(id: string): Promise<AdminLeadDetail> {
  return request(`/api/admin/leads/${encodeURIComponent(id)}`);
}

export function updateLeadStatus(
  id: number,
  status: LeadStatus,
  csrfToken: string,
): Promise<AdminLeadDetail> {
  return request(
    `/api/admin/leads/${String(id)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
    csrfToken,
  );
}

export function addLeadNote(id: number, note: string, csrfToken: string): Promise<AdminLeadDetail> {
  return request(
    `/api/admin/leads/${String(id)}/notes`,
    { method: 'POST', body: JSON.stringify({ note }) },
    csrfToken,
  );
}
