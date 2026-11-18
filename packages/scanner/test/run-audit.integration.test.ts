import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditRunner } from '../src/audit/run-audit.js';
import { createSafeFetch } from '../src/net/create-safe-fetch.js';

// Rebanada vertical del scanner contra servidores locales (HTTP en "80" y HTTPS en "443").
// La política de IP no se relaja: fixture.test resuelve a una IP pública y la fábrica interna
// dirige la conexión al servidor local según el puerto.

const tls = (name: string) => readFileSync(new URL(`fixtures/tls/${name}`, import.meta.url));

let plain: http.Server;
let secure: https.Server;
const portOf = (s: http.Server) => (s.address() as { port: number }).port;

beforeAll(async () => {
  plain = http.createServer((_req, res) => {
    res.writeHead(301, { location: 'https://fixture.test/' }).end();
  });
  secure = https.createServer(
    { key: tls('fixture.key'), cert: tls('fixture.crt') },
    (_req, res) => {
      res.writeHead(200, {
        'strict-transport-security': 'max-age=31536000',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'strict-origin-when-cross-origin',
      });
      res.end('<html><title>Fixture</title></html>');
    },
  );
  for (const server of [plain, secure]) {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  }
});

afterAll(async () => {
  for (const server of [plain, secure]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('runAudit contra servidores locales', () => {
  it('produce los hallazgos de seguridad de punta a punta', async () => {
    const fetch = createSafeFetch({
      resolver: () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
      testEndpoint: (_ip, port) => ({
        host: '127.0.0.1',
        port: port === 443 ? portOf(secure) : portOf(plain),
      }),
      ca: tls('ca.crt'),
    });
    const runAudit = createAuditRunner({
      fetch,
      now: () => new Date(),
      sleep: () => Promise.resolve(),
    });
    const { findings } = await runAudit('https://fixture.test/', {
      contactUrl: 'https://example.invalid/contacto',
    });
    const statuses = Object.fromEntries(findings.map((f) => [f.checkId, f.status]));
    expect(statuses).toEqual({
      'SEC-01': 'pass',
      'SEC-02': 'pass',
      'SEC-03': 'pass',
      'SEC-04': 'pass',
      'SEC-05': 'pass',
      'SEC-07': 'pass',
      'SEC-08': 'pass',
      'SEC-09': 'pass',
    });
  });
});
