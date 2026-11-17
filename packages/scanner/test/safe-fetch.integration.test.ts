import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MAX_BODY_BYTES,
  createSafeFetch,
  type Resolver,
  type SafeFetchDeps,
} from '../src/net/create-safe-fetch.js';

// Integración contra servidores locales. La política de IP nunca se relaja: el resolver falso
// devuelve IP públicas reales y solo la fábrica interna redirige la conexión al servidor local.

const OPTIONS = { contactUrl: 'https://example.invalid/contacto' } as const;
const tls = (name: string) => readFileSync(new URL(`fixtures/tls/${name}`, import.meta.url));

const DNS: Record<string, string[]> = {
  'publico.test': ['8.8.8.8'],
  'otro-publico.test': ['1.1.1.1'],
  'fixture.test': ['8.8.8.8'],
  'otro.test': ['8.8.8.8'],
  'interno.test': ['10.0.0.1'],
};

const resolver: Resolver = (hostname) => {
  const ips = DNS[hostname];
  return ips === undefined
    ? Promise.reject(new Error('ENOTFOUND'))
    : Promise.resolve(ips.map((address) => ({ address, family: 4 as const })));
};

const bigChunk = Buffer.alloc(64 * 1024, 'a');
let connections = 0;

function routes(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  const redirect = (location: string, status = 302) => {
    res.writeHead(status, { location }).end();
  };

  if (path === '/ok') {
    res.end('hola');
  } else if (path === '/echo') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.headers));
  } else if (path === '/rel') {
    redirect('/ok?desde=rel');
  } else if (path === '/to-internal-host') {
    redirect('http://interno.test/');
  } else if (path === '/to-internal-literal') {
    redirect('http://127.0.0.1/');
  } else if (path === '/to-ftp') {
    redirect('ftp://publico.test/');
  } else if (path === '/to-port') {
    redirect('http://publico.test:8080/');
  } else if (path === '/to-creds') {
    redirect('http://user:pass@publico.test/');
  } else if (path === '/to-literal-public') {
    redirect('http://1.1.1.1/ok', 301);
  } else if (path === '/to-invalid') {
    redirect('http://[no-valida/');
  } else if (path === '/no-location') {
    res.writeHead(302).end('sin destino');
  } else if (path.startsWith('/chain/')) {
    const n = Number(path.slice('/chain/'.length));
    if (n === 0) res.end('fin');
    else redirect(`/chain/${String(n - 1)}`, n % 2 === 0 ? 307 : 308);
  } else if (path === '/big') {
    let sent = 0;
    res.setHeader('content-length', String(MAX_BODY_BYTES + bigChunk.length));
    const write = () => {
      while (sent <= MAX_BODY_BYTES) {
        sent += bigChunk.length;
        if (!res.write(bigChunk)) {
          res.once('drain', write);
          return;
        }
      }
      res.end();
    };
    write();
  } else if (path === '/big-chunked') {
    // Sin Content-Length: el tope se aplica sobre los bytes que llegan.
    const write = () => {
      while (res.write(bigChunk));
      res.once('drain', write);
    };
    write();
  } else if (path === '/exact-limit') {
    res.end(Buffer.alloc(MAX_BODY_BYTES, 'b'));
  } else if (path === '/gzip') {
    res.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync('hola comprimido'));
  } else if (path === '/br') {
    res.writeHead(200, { 'content-encoding': 'br' }).end(brotliCompressSync('hola brotli'));
  } else if (path === '/gzip-bomb') {
    res
      .writeHead(200, { 'content-encoding': 'gzip' })
      .end(gzipSync(Buffer.alloc(MAX_BODY_BYTES * 3)));
  } else if (path === '/gzip-broken') {
    res.writeHead(200, { 'content-encoding': 'gzip' }).end(Buffer.from('esto no es gzip'));
  } else if (path === '/zstd') {
    res.writeHead(200, { 'content-encoding': 'zstd' }).end('x');
  } else if (path === '/drip') {
    // Goteo: cada byte reinicia cualquier timeout por inactividad, pero el global corta igual.
    res.writeHead(200);
    const timer = setInterval(() => res.write('.'), 20);
    res.on('close', () => {
      clearInterval(timer);
    });
  } else if (path === '/hang') {
    // Nunca responde.
  } else {
    res.writeHead(404).end();
  }
}

let httpServer: http.Server;
let caSigned: https.Server;
let selfSigned: https.Server;
const port = (s: http.Server | https.Server) => (s.address() as { port: number }).port;

async function listen<T extends http.Server | https.Server>(server: T): Promise<T> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

beforeAll(async () => {
  httpServer = await listen(http.createServer(routes));
  httpServer.on('connection', () => {
    connections += 1;
  });
  caSigned = await listen(
    https.createServer({ key: tls('fixture.key'), cert: tls('fixture.crt') }, routes),
  );
  selfSigned = await listen(
    https.createServer({ key: tls('selfsigned.key'), cert: tls('selfsigned.crt') }, routes),
  );
});

afterAll(async () => {
  for (const server of [httpServer, caSigned, selfSigned]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** Fábrica interna con la conexión dirigida al servidor local indicado. */
function fetcherTo(server: () => http.Server | https.Server, extra: Partial<SafeFetchDeps> = {}) {
  return createSafeFetch({
    resolver,
    testEndpoint: () => ({ host: '127.0.0.1', port: port(server()) }),
    timeoutMs: 2_000,
    ...extra,
  });
}

const local = fetcherTo(() => httpServer);

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error('Se esperaba un rechazo');
}

describe('respuesta básica', () => {
  it('descarga el cuerpo y devuelve la IP validada', async () => {
    const res = await local('http://publico.test/ok', OPTIONS);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('hola');
    expect(res.url).toBe('http://publico.test/ok');
    expect(res.address).toBe('8.8.8.8');
    expect(res.redirects).toEqual([]);
    expect(res.contentEncoding).toBeNull();
  });

  it('envía User-Agent identificable, identity por defecto y nada de cookies ni credenciales', async () => {
    const res = await local('http://publico.test/echo', OPTIONS);
    const headers = JSON.parse(res.body.toString()) as Record<string, string>;
    expect(headers['user-agent']).toBe('AuditorWebPyme/1.0 (+https://example.invalid/contacto)');
    expect(headers['accept-encoding']).toBe('identity');
    expect(headers['host']).toBe('publico.test');
    expect(headers['connection']).toBe('close');
    expect(headers).not.toHaveProperty('cookie');
    expect(headers).not.toHaveProperty('authorization');
  });

  it('HEAD no descarga cuerpo', async () => {
    const res = await local('http://publico.test/ok', { ...OPTIONS, method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it('un error de conexión se informa como NETWORK_ERROR', async () => {
    const closed = await listen(http.createServer());
    const closedPort = port(closed);
    await new Promise((resolve) => closed.close(resolve));
    const fetcher = createSafeFetch({
      resolver,
      testEndpoint: () => ({ host: '127.0.0.1', port: closedPort }),
    });
    expect(await rejectionCode(fetcher('http://publico.test/', OPTIONS))).toBe('NETWORK_ERROR');
  });
});

describe('anclaje de IP (anti DNS rebinding)', () => {
  it('resuelve una sola vez por salto y conecta a la IP validada', async () => {
    const answers = [['8.8.8.8'], ['127.0.0.1']];
    const rebinding = vi.fn<Resolver>((hostname) => {
      const ips = answers.shift() ?? ['127.0.0.1'];
      return Promise.resolve(
        hostname === 'rebind.test' ? ips.map((address) => ({ address, family: 4 as const })) : [],
      );
    });
    const fetcher = fetcherTo(() => httpServer, { resolver: rebinding });
    const res = await fetcher('http://rebind.test/ok', OPTIONS);
    expect(res.status).toBe(200);
    expect(res.address).toBe('8.8.8.8');
    expect(rebinding).toHaveBeenCalledTimes(1);
  });

  it('abre una conexión nueva por salto (sin keep-alive)', async () => {
    const before = connections;
    const res = await local('http://publico.test/chain/2', OPTIONS);
    expect(res.body.toString()).toBe('fin');
    expect(connections - before).toBe(3);
  });
});

describe('redirecciones', () => {
  it('resuelve una Location relativa contra la URL actual', async () => {
    const res = await local('http://publico.test/rel', OPTIONS);
    expect(res.url).toBe('http://publico.test/ok?desde=rel');
    expect(res.redirects).toEqual(['http://publico.test/rel']);
  });

  it('acepta una cadena de 3 redirecciones', async () => {
    const res = await local('http://publico.test/chain/3', OPTIONS);
    expect(res.redirects).toHaveLength(3);
  });

  it('rechaza una cadena de más de 3 redirecciones', async () => {
    expect(await rejectionCode(local('http://publico.test/chain/4', OPTIONS))).toBe(
      'TOO_MANY_REDIRECTS',
    );
  });

  it.each([
    ['/to-internal-host', 'BLOCKED_IP'],
    ['/to-internal-literal', 'BLOCKED_IP'],
    ['/to-ftp', 'BLOCKED_SCHEME'],
    ['/to-port', 'BLOCKED_PORT'],
    ['/to-creds', 'CREDENTIALS_IN_URL'],
    ['/to-invalid', 'INVALID_REDIRECT'],
  ])('revalida cada salto: %s → %s', async (path, code) => {
    expect(await rejectionCode(local(`http://publico.test${path}`, OPTIONS))).toBe(code);
  });

  it('valida las IP literales también en los saltos', async () => {
    const resolverSpy = vi.fn<Resolver>(resolver);
    const fetcher = fetcherTo(() => httpServer, { resolver: resolverSpy });
    const res = await fetcher('http://publico.test/to-literal-public', OPTIONS);
    expect(res.url).toBe('http://1.1.1.1/ok');
    expect(res.address).toBe('1.1.1.1');
    expect(resolverSpy).toHaveBeenCalledTimes(1);
  });

  it('un 3xx sin Location se devuelve como respuesta final', async () => {
    const res = await local('http://publico.test/no-location', OPTIONS);
    expect(res.status).toBe(302);
  });
});

describe('límites de tamaño (2 MB sobre bytes reales)', () => {
  it('corta una respuesta de más de 2 MB', async () => {
    expect(await rejectionCode(local('http://publico.test/big', OPTIONS))).toBe('BODY_TOO_LARGE');
  });

  it('corta una respuesta sin Content-Length que nunca termina', async () => {
    expect(await rejectionCode(local('http://publico.test/big-chunked', OPTIONS))).toBe(
      'BODY_TOO_LARGE',
    );
  });

  it('acepta exactamente 2 MB', async () => {
    const res = await local('http://publico.test/exact-limit', OPTIONS);
    expect(res.body.length).toBe(MAX_BODY_BYTES);
  });

  it('corta una bomba de compresión por los bytes descomprimidos', async () => {
    expect(
      await rejectionCode(
        local('http://publico.test/gzip-bomb', { ...OPTIONS, acceptEncoding: 'gzip-br' }),
      ),
    ).toBe('BODY_TOO_LARGE');
  });
});

describe('compresión', () => {
  it('con gzip-br pide "gzip, br" y descomprime gzip', async () => {
    const echo = await local('http://publico.test/echo', { ...OPTIONS, acceptEncoding: 'gzip-br' });
    expect((JSON.parse(echo.body.toString()) as Record<string, string>)['accept-encoding']).toBe(
      'gzip, br',
    );
    const res = await local('http://publico.test/gzip', { ...OPTIONS, acceptEncoding: 'gzip-br' });
    expect(res.body.toString()).toBe('hola comprimido');
    expect(res.contentEncoding).toBe('gzip');
  });

  it('descomprime brotli', async () => {
    const res = await local('http://publico.test/br', { ...OPTIONS, acceptEncoding: 'gzip-br' });
    expect(res.body.toString()).toBe('hola brotli');
    expect(res.contentEncoding).toBe('br');
  });

  it('si el servidor comprime aunque se pidió identity, igual descomprime con tope', async () => {
    const res = await local('http://publico.test/gzip', OPTIONS);
    expect(res.body.toString()).toBe('hola comprimido');
  });

  it('una codificación no soportada o un gzip roto se rechazan', async () => {
    expect(await rejectionCode(local('http://publico.test/zstd', OPTIONS))).toBe(
      'UNSUPPORTED_ENCODING',
    );
    expect(await rejectionCode(local('http://publico.test/gzip-broken', OPTIONS))).toBe(
      'DECODE_ERROR',
    );
  });
});

describe('timeout global', () => {
  it('corta un servidor que nunca responde', async () => {
    const fetcher = fetcherTo(() => httpServer, { timeoutMs: 200 });
    expect(await rejectionCode(fetcher('http://publico.test/hang', OPTIONS))).toBe('TIMEOUT');
  });

  it('corta un cuerpo que gotea aunque nunca quede inactivo', async () => {
    const fetcher = fetcherTo(() => httpServer, { timeoutMs: 300 });
    const started = Date.now();
    expect(await rejectionCode(fetcher('http://publico.test/drip', OPTIONS))).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('respeta una señal externa abortada en medio de la descarga', async () => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, 100);
    expect(
      await rejectionCode(
        local('http://publico.test/drip', { ...OPTIONS, signal: controller.signal }),
      ),
    ).toBe('ABORTED');
  });
});

describe('TLS (sin tocar la verificación)', () => {
  it('acepta un certificado válido firmado por la CA de prueba', async () => {
    const fetcher = fetcherTo(() => caSigned, { ca: tls('ca.crt') });
    const res = await fetcher('https://fixture.test/ok', OPTIONS);
    expect(res.body.toString()).toBe('hola');
  });

  it('rechaza un certificado autofirmado', async () => {
    const fetcher = fetcherTo(() => selfSigned, { ca: tls('ca.crt') });
    expect(await rejectionCode(fetcher('https://fixture.test/ok', OPTIONS))).toBe('TLS_ERROR');
  });

  it('rechaza un certificado cuyo nombre no coincide', async () => {
    const fetcher = fetcherTo(() => caSigned, { ca: tls('ca.crt') });
    expect(await rejectionCode(fetcher('https://otro.test/ok', OPTIONS))).toBe('TLS_ERROR');
  });

  it('sin la CA de prueba, el certificado de prueba no es confiable', async () => {
    const fetcher = fetcherTo(() => caSigned);
    expect(await rejectionCode(fetcher('https://fixture.test/ok', OPTIONS))).toBe('TLS_ERROR');
  });
});
