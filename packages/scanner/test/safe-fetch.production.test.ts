import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import type { LookupAddress } from 'node:dns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Verifica el camino de producción sin red: se interceptan el DNS del sistema y los módulos
// http/https para inspeccionar las opciones con las que safeFetch abre la conexión.

const captured: RequestOptions[] = [];

function fakeRequest(options: RequestOptions) {
  captured.push(options);
  const req = new EventEmitter() as EventEmitter & { end: () => void };
  req.end = () => {
    queueMicrotask(() =>
      req.emit('error', Object.assign(new Error('corte'), { code: 'ECONNRESET' })),
    );
  };
  return req;
}

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(() =>
    Promise.resolve([
      { address: '8.8.8.8', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ]),
  ),
}));
vi.mock('node:https', () => ({ default: { request: vi.fn(fakeRequest) } }));
vi.mock('node:http', () => ({ default: { request: vi.fn(fakeRequest) } }));

const { safeFetch } = await import('../src/net/safe-fetch.js');
const { TIMEOUT_MS } = await import('../src/net/create-safe-fetch.js');

const OPTIONS = { contactUrl: 'https://example.invalid/contacto' } as const;

beforeEach(() => {
  captured.length = 0;
});

async function lastOptions(url: string): Promise<RequestOptions> {
  await expect(safeFetch(url, OPTIONS)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  const options = captured.at(-1);
  if (options === undefined) throw new Error('No se abrió ninguna conexión');
  return options;
}

describe('camino de producción', () => {
  it('no pasa ca ni desactiva la verificación TLS', async () => {
    const options = await lastOptions('https://ejemplo.com/');
    expect(options.ca).toBeUndefined();
    expect(options).not.toHaveProperty('rejectUnauthorized');
    expect(options).not.toHaveProperty('checkServerIdentity');
    expect(options.servername).toBe('ejemplo.com');
  });

  it('usa una conexión nueva sin agente, con señal de corte y puerto 443', async () => {
    const options = await lastOptions('https://ejemplo.com/ruta?x=1');
    expect(options.agent).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.port).toBe(443);
    expect(options.path).toBe('/ruta?x=1');
    expect(options.host).toBe('ejemplo.com');
  });

  it('el lookup anclado devuelve solo las IP ya validadas, también con all:true', async () => {
    const options = await lastOptions('http://ejemplo.com/');
    const lookup = options.lookup;
    if (lookup === undefined) throw new Error('Falta el lookup anclado');

    const all = await new Promise<LookupAddress[]>((resolve, reject) => {
      lookup('ejemplo.com', { all: true }, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses as LookupAddress[]);
      });
    });
    expect(all).toEqual([
      { address: '8.8.8.8', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ]);

    const one = await new Promise<string>((resolve, reject) => {
      lookup('ejemplo.com', {}, (err, address) => {
        if (err) reject(err);
        else resolve(address as string);
      });
    });
    expect(one).toBe('8.8.8.8');

    const otherHost = await new Promise<Error | null>((resolve) => {
      lookup('otro.com', { all: true }, (err) => {
        resolve(err);
      });
    });
    expect(otherHost).toMatchObject({ code: 'BLOCKED_HOST' });
  });

  it('el timeout global de producción es de 10 s', () => {
    expect(TIMEOUT_MS).toBe(10_000);
  });
});
