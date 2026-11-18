import { describe, expect, it, vi } from 'vitest';
import { createAuditRunner } from '../src/audit/run-audit.js';
import type { Check } from '../src/checks/check.js';
import { SafeFetchError } from '../src/net/errors.js';
import type { SafeFetch } from '../src/net/create-safe-fetch.js';
import { NOW, response } from './checks/fixtures.js';

// Orquestador sin red: el fetch es falso.

const OPTIONS = { contactUrl: 'https://example.invalid/contacto' } as const;

function setup(fetch: SafeFetch, checks?: readonly Check[]) {
  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
  let clock = NOW.getTime();
  const runner = createAuditRunner({
    fetch,
    sleep,
    now: () => new Date(clock),
    ...(checks === undefined ? {} : { checks }),
  });
  return { runner, sleep, advance: (ms: number) => (clock += ms) };
}

describe('runAudit', () => {
  it('pide HTTPS (con gzip, br) y HTTP, respetando 1 request por segundo', async () => {
    const fetch = vi.fn<SafeFetch>((url) => Promise.resolve(response({ url })));
    const { runner, sleep } = setup(fetch);
    const { findings } = await runner('https://ejemplo.com/ruta', OPTIONS);

    expect(fetch.mock.calls.map(([url, opts]) => [url, opts.acceptEncoding])).toEqual([
      ['https://ejemplo.com/ruta', 'gzip-br'],
      ['http://ejemplo.com/ruta', undefined],
    ]);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBe(1000);
    expect(findings.map((f) => f.checkId)).toContain('SEC-01');
  });

  it('si HTTPS falla por certificado, sigue con HTTP y arma tls { valid: false, error }', async () => {
    const seen: unknown[] = [];
    const spy: Check = {
      id: 'SPY',
      category: 'security',
      run: (ctx) => {
        seen.push(ctx.tls, ctx.primary?.url);
        return Promise.resolve([]);
      },
    };
    const fetch: SafeFetch = (url) =>
      url.startsWith('https:')
        ? Promise.reject(new SafeFetchError('TLS_ERROR', 'x', { detail: 'CERT_HAS_EXPIRED' }))
        : Promise.resolve(response({ url }));
    const { runner } = setup(fetch, [spy]);
    await runner('https://ejemplo.com/', OPTIONS);
    expect(seen).toEqual([{ valid: false, error: 'CERT_HAS_EXPIRED' }, 'http://ejemplo.com/']);
  });

  it('si fallan HTTPS y HTTP, la auditoría falla con el error de HTTPS', async () => {
    const fetch: SafeFetch = (url) =>
      Promise.reject(new SafeFetchError(url.startsWith('https:') ? 'DNS_FAILURE' : 'TIMEOUT', 'x'));
    const { runner } = setup(fetch);
    await expect(runner('https://no-existe.com/', OPTIONS)).rejects.toMatchObject({
      code: 'DNS_FAILURE',
    });
  });

  it('un error inesperado del fetch no se oculta', async () => {
    const { runner } = setup(() => Promise.reject(new TypeError('bug')));
    await expect(runner('https://ejemplo.com/', OPTIONS)).rejects.toThrow(TypeError);
  });

  it('rechaza URLs que no pasan la validación previa', async () => {
    const fetch = vi.fn<SafeFetch>();
    const { runner } = setup(fetch);
    await expect(runner('http://127.0.0.1/', OPTIONS)).rejects.toMatchObject({
      code: 'BLOCKED_IP',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('un check que falla no rompe la auditoría: queda como "no aplica"', async () => {
    const broken: Check = {
      id: 'ROTO',
      category: 'security',
      run: () => Promise.reject(new Error('x')),
    };
    const { runner } = setup((url) => Promise.resolve(response({ url })), [broken]);
    const { findings } = await runner('https://ejemplo.com/', OPTIONS);
    expect(findings).toMatchObject([{ checkId: 'ROTO', status: 'na', severity: 'info' }]);
  });
});
