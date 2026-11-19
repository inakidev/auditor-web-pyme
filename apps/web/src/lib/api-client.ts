// Único lugar de la web que usa fetch: habla solo con nuestra propia API (mismo origen).
import type { ApiError, AuditView, CreateAuditResponse } from '@auditor/shared';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
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
