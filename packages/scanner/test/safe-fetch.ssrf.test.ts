import { describe, expect, it, vi } from 'vitest';
import { createSafeFetch, type Resolver } from '../src/net/create-safe-fetch.js';
import { isPublicIp } from '../src/net/ip-policy.js';
import { safeFetch } from '../src/net/safe-fetch.js';

// Suite SSRF (RF-02, RNF-01). Ningún caso abre conexiones: todos se rechazan antes de la red.
// Las IP públicas de ejemplo son reales (8.8.8.8, 1.1.1.1): los rangos de documentación están bloqueados.

const OPTIONS = { contactUrl: 'https://example.invalid/contacto' } as const;

/** Resolver falso: nunca consulta DNS real. */
function fakeResolver(table: Record<string, string[]>): Resolver {
  return (hostname) => {
    const ips = table[hostname];
    if (ips === undefined) return Promise.reject(new Error(`ENOTFOUND ${hostname}`));
    return Promise.resolve(
      ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  };
}

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('camino de producción: rechazos antes de tocar la red', () => {
  it.each([
    ['http://127.0.0.1', 'BLOCKED_IP'],
    ['http://0.0.0.0', 'BLOCKED_IP'],
    ['http://10.0.0.1', 'BLOCKED_IP'],
    ['http://172.16.0.1', 'BLOCKED_IP'],
    ['http://192.168.1.1', 'BLOCKED_IP'],
    ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_IP'],
    ['http://100.64.0.1', 'BLOCKED_IP'],
    ['http://192.0.0.1', 'BLOCKED_IP'],
    ['http://198.18.0.1', 'BLOCKED_IP'],
    ['http://240.0.0.1', 'BLOCKED_IP'],
    ['http://255.255.255.255', 'BLOCKED_IP'],
    ['http://224.0.0.1', 'BLOCKED_IP'],
    ['http://203.0.113.10', 'BLOCKED_IP'],
    ['http://[::]', 'BLOCKED_IP'],
    ['http://[::1]', 'BLOCKED_IP'],
    ['http://[fd00::1]', 'BLOCKED_IP'],
    ['http://[fe80::1]', 'BLOCKED_IP'],
    ['http://[ff02::1]', 'BLOCKED_IP'],
    ['http://[::ffff:127.0.0.1]', 'BLOCKED_IP'],
    ['http://[64:ff9b::7f00:1]', 'BLOCKED_IP'],
    ['http://[2002:7f00:1::]', 'BLOCKED_IP'],
    ['http://[2001::1]', 'BLOCKED_IP'],
    ['http://[2001:db8::1]', 'BLOCKED_IP'],
    ['http://2130706433', 'BLOCKED_IP'],
    ['http://0177.0.0.1', 'BLOCKED_IP'],
    ['http://0x7f000001', 'BLOCKED_IP'],
    ['http://127.1', 'BLOCKED_IP'],
    ['http://localhost', 'BLOCKED_HOST'],
    ['http://LOCALHOST.', 'BLOCKED_HOST'],
    ['http://app.localhost', 'BLOCKED_HOST'],
    ['http://ejemplo.com@127.0.0.1', 'CREDENTIALS_IN_URL'],
    ['http://user:pass@ejemplo.com', 'CREDENTIALS_IN_URL'],
    ['file:///etc/passwd', 'BLOCKED_SCHEME'],
    ['gopher://ejemplo.com:70/_x', 'BLOCKED_SCHEME'],
    ['ftp://ejemplo.com', 'BLOCKED_SCHEME'],
    ['javascript:alert(1)', 'BLOCKED_SCHEME'],
    ['http://ejemplo.com:22', 'BLOCKED_PORT'],
    ['http://ejemplo.com:6379', 'BLOCKED_PORT'],
    ['http://ejemplo.com:8080', 'BLOCKED_PORT'],
    ['https://ejemplo.com:8443', 'BLOCKED_PORT'],
    ['no es una url', 'INVALID_URL'],
  ])('%s → %s', async (url, code) => {
    expect(await rejectionCode(safeFetch(url, OPTIONS))).toBe(code);
  });
});

describe('validación de opciones', () => {
  it('rechaza una URL de contacto inválida o con caracteres de control', async () => {
    for (const contactUrl of ['', 'no-url', 'https://a.example/\r\nX-Inyectado: 1']) {
      expect(await rejectionCode(safeFetch('http://8.8.8.8', { contactUrl }))).toBe(
        'INVALID_OPTIONS',
      );
    }
  });

  it('rechaza acceptEncoding fuera del tipo cerrado', async () => {
    const options = { ...OPTIONS, acceptEncoding: 'deflate' } as unknown as Parameters<
      typeof safeFetch
    >[1];
    expect(await rejectionCode(safeFetch('http://8.8.8.8', options))).toBe('INVALID_OPTIONS');
  });

  it('rechaza métodos distintos de GET y HEAD', async () => {
    const options = { ...OPTIONS, method: 'POST' } as unknown as Parameters<typeof safeFetch>[1];
    expect(await rejectionCode(safeFetch('http://8.8.8.8', options))).toBe('INVALID_OPTIONS');
  });
});

describe('resolución DNS', () => {
  it('un dominio que resuelve a una IP interna se rechaza', async () => {
    const fetcher = createSafeFetch({ resolver: fakeResolver({ 'interno.test': ['10.0.0.5'] }) });
    expect(await rejectionCode(fetcher('http://interno.test/', OPTIONS))).toBe('BLOCKED_IP');
  });

  it('si alguna de las IP devueltas es interna, se rechaza aunque otras sean públicas', async () => {
    const fetcher = createSafeFetch({
      resolver: fakeResolver({ 'mixto.test': ['8.8.8.8', '1.1.1.1', '192.168.1.10'] }),
    });
    expect(await rejectionCode(fetcher('http://mixto.test/', OPTIONS))).toBe('BLOCKED_IP');
  });

  it('una IPv6 interna entre las respuestas también se rechaza', async () => {
    const fetcher = createSafeFetch({
      resolver: fakeResolver({ 'v6.test': ['2606:4700:4700::1111', '::ffff:10.0.0.1'] }),
    });
    expect(await rejectionCode(fetcher('http://v6.test/', OPTIONS))).toBe('BLOCKED_IP');
  });

  it('las IP literales se validan sin llamar al resolver', async () => {
    const resolver = vi.fn<Resolver>();
    const fetcher = createSafeFetch({ resolver });
    expect(await rejectionCode(fetcher('http://0x7f000001/', OPTIONS))).toBe('BLOCKED_IP');
    expect(await rejectionCode(fetcher('http://[::1]/', OPTIONS))).toBe('BLOCKED_IP');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('un error de DNS o una respuesta vacía dan DNS_FAILURE', async () => {
    const fetcher = createSafeFetch({ resolver: fakeResolver({ 'vacio.test': [] }) });
    expect(await rejectionCode(fetcher('http://no-existe.test/', OPTIONS))).toBe('DNS_FAILURE');
    expect(await rejectionCode(fetcher('http://vacio.test/', OPTIONS))).toBe('DNS_FAILURE');
  });

  it('un DNS que no responde corta por el timeout global', async () => {
    const fetcher = createSafeFetch({
      resolver: () => new Promise(() => undefined),
      timeoutMs: 100,
    });
    expect(await rejectionCode(fetcher('http://lento.test/', OPTIONS))).toBe('TIMEOUT');
  });

  it('una señal externa ya abortada corta sin resolver', async () => {
    const resolver = vi.fn<Resolver>();
    const fetcher = createSafeFetch({ resolver });
    const signal = AbortSignal.abort();
    expect(await rejectionCode(fetcher('http://publico.test/', { ...OPTIONS, signal }))).toBe(
      'ABORTED',
    );
  });
});

describe('política de IP', () => {
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'permite la IP pública %s',
    (ip) => {
      expect(isPublicIp(ip)).toBe(true);
    },
  );

  it.each([
    '0.1.2.3',
    '127.0.0.53',
    '10.255.255.255',
    '172.31.0.1',
    '192.168.255.255',
    '169.254.169.254',
    '100.127.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.1',
    '239.255.255.250',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
    '64:ff9b:1::1',
    '2002:808:808::1',
    '2001:0:4136:e378::1',
    '2001:db8::1',
    '3fff::1',
    'fc00::1',
    'fdff::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    'no-es-ip',
  ])('bloquea %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
});
