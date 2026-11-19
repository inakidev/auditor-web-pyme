import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createAudit, getAudit } from './api-client.js';

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
});
