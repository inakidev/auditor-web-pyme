import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  createAudit,
  deleteAdminAudit,
  deleteAdminLead,
  getAudit,
  getPublicConfig,
  listAdminAudits,
  login,
  logout,
  toQueryString,
} from './api-client.js';

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api-client', () => {
  it('createAudit hace POST JSON al mismo origen y devuelve el token', async () => {
    const fetchMock = vi.fn(() => json(202, { token: 't' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createAudit('ejemplo.com')).toEqual({ token: 't' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audits',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'ejemplo.com' }),
        credentials: 'same-origin',
      }),
    );
  });

  it('createAudit manda correo y consentimiento solo si hay correo', async () => {
    const fetchMock = vi.fn(() => json(202, { token: 't' }));
    vi.stubGlobal('fetch', fetchMock);
    await createAudit('ejemplo.com', { email: 'a@b.com', consent: true });
    await createAudit('ejemplo.com', { email: '  ', consent: true });
    const bodies = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(
      ([, init]) => init.body,
    );
    expect(bodies).toEqual([
      JSON.stringify({ url: 'ejemplo.com', email: 'a@b.com', consent: true }),
      JSON.stringify({ url: 'ejemplo.com' }),
    ]);
  });

  it('getAudit codifica el token en la ruta', async () => {
    const fetchMock = vi.fn(() => json(200, { status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    await getAudit('a/b');
    expect(fetchMock).toHaveBeenCalledWith('/api/audits/a%2Fb', expect.anything());
  });

  it('traduce un error de la API a ApiRequestError con su mensaje', async () => {
    vi.stubGlobal('fetch', () =>
      json(400, { error: { code: 'BLOCKED_IP', message: 'Mensaje claro' } }),
    );
    await expect(createAudit('127.0.0.1')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 400,
      code: 'BLOCKED_IP',
      message: 'Mensaje claro',
    });
  });

  it('usa un mensaje genérico si la respuesta de error no tiene el formato esperado', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html>', { status: 502 })));
    const error = await getAudit('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe('UNKNOWN');
  });

  it('informa un error de red sin detalles técnicos', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(getAudit('x')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('login manda el token CSRF en la cabecera, nunca en la URL', async () => {
    const fetchMock = vi.fn(() => json(200, { email: 'c@agencia.com', csrfToken: 's' }));
    vi.stubGlobal('fetch', fetchMock);
    await login('c@agencia.com', 'secreta', 'tok');
    const [path, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0] ?? [];
    expect(path).toBe('/api/auth/login');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-csrf-token': 'tok' });
  });

  it('logout tolera la respuesta 204 sin cuerpo', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(logout('s')).resolves.toBeUndefined();
  });

  it('los listados del panel mandan solo los filtros con valor', async () => {
    const fetchMock = vi.fn(() => json(200, { items: [], total: 0, page: 1, pageSize: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    await listAdminAudits({ domain: 'ejemplo', status: '', page: '2' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/audits?domain=ejemplo&page=2',
      expect.anything(),
    );
    expect(toQueryString({ a: '' })).toBe('');
  });

  it('getPublicConfig consulta /api/config', async () => {
    const fetchMock = vi.fn(() => json(200, { contactCapture: false, demoNotice: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getPublicConfig()).toEqual({ contactCapture: false, demoNotice: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/config', expect.anything());
  });

  it('los borrados del panel usan DELETE con el token CSRF en la cabecera', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    await deleteAdminAudit(7, 'tok');
    await deleteAdminLead(3, 'tok');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([path]) => path)).toEqual(['/api/admin/audits/7', '/api/admin/leads/3']);
    for (const [, init] of calls) {
      expect(init.method).toBe('DELETE');
      expect(init.headers).toMatchObject({ 'x-csrf-token': 'tok' });
    }
  });
});
