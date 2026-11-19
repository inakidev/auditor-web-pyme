import type { Finding } from '@auditor/shared';
import { describe, expect, it } from 'vitest';
import type { AuditContext } from '../../src/audit/context.js';
import type { Check } from '../../src/checks/check.js';
import { SECURITY_CHECKS } from '../../src/checks/index.js';
import { context, failed, inDays, ok, response, withHeaders, GOOD_TLS } from './fixtures.js';

// Checks SEC-01 a SEC-05 y SEC-07 a SEC-09 (RF-03), con fixtures y sin red.

const byId = (id: string): Check => {
  const check = SECURITY_CHECKS.find((c) => c.id === id);
  if (check === undefined) throw new Error(`Falta el check ${id}`);
  return check;
};

async function run(id: string, ctx: AuditContext): Promise<Finding> {
  const findings = await byId(id).run(ctx);
  expect(findings).toHaveLength(1);
  const [finding] = findings as [Finding];
  expect(finding.checkId).toBe(id);
  expect(finding.category).toBe('security');
  expect(finding.title.length).toBeGreaterThan(5);
  expect(finding.recommendation.length).toBeGreaterThan(5);
  expect((finding.evidence ?? '').length).toBeLessThanOrEqual(300);
  return finding;
}

const SECRET = 'valor-secreto-123';
const H3 = ['SEC-01', 'SEC-02', 'SEC-03', 'SEC-04', 'SEC-05', 'SEC-07', 'SEC-08', 'SEC-09'];

describe('catálogo', () => {
  it('incluye los checks de H3 (los de H10 se prueban en security-extra.test.ts)', () => {
    expect(SECURITY_CHECKS.map((c) => c.id).filter((id) => H3.includes(id))).toEqual([
      'SEC-01',
      'SEC-02',
      'SEC-03',
      'SEC-04',
      'SEC-05',
      'SEC-07',
      'SEC-08',
      'SEC-09',
    ]);
  });

  it('en un sitio bien configurado todos cumplen', async () => {
    const ctx = withHeaders({
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
    for (const id of H3) {
      expect((await run(id, ctx)).status, id).toBe('pass');
    }
  });
});

describe('SEC-01 HTTPS disponible', () => {
  it('falla si no hay HTTPS', async () => {
    const f = await run('SEC-01', context({ https: failed('NETWORK_ERROR') }));
    expect(f).toMatchObject({ status: 'fail', severity: 'critical' });
  });

  it('advierte si HTTPS responde con un certificado inválido', async () => {
    const f = await run('SEC-01', context({ https: failed('TLS_ERROR', 'CERT_HAS_EXPIRED') }));
    expect(f.status).toBe('warn');
  });

  it('falla si HTTPS redirige a HTTP', async () => {
    const res = response({
      url: 'http://ejemplo.com/',
      redirects: [{ url: 'https://ejemplo.com/', status: 301 }],
    });
    expect((await run('SEC-01', context({ https: ok(res) }))).status).toBe('fail');
  });
});

describe('SEC-02 HTTP redirige a HTTPS', () => {
  it('advierte si la redirección es temporal', async () => {
    const http = ok(
      response({
        url: 'https://ejemplo.com/',
        redirects: [{ url: 'http://ejemplo.com/', status: 302 }],
      }),
    );
    expect((await run('SEC-02', context({ http }))).status).toBe('warn');
  });

  it('cumple con varias redirecciones permanentes hasta HTTPS', async () => {
    const http = ok(
      response({
        url: 'https://www.ejemplo.com/',
        redirects: [
          { url: 'http://ejemplo.com/', status: 301 },
          { url: 'http://www.ejemplo.com/', status: 308 },
        ],
      }),
    );
    expect((await run('SEC-02', context({ http }))).status).toBe('pass');
  });

  it('falla si HTTP sirve el contenido sin redirigir', async () => {
    const http = ok(response({ url: 'http://ejemplo.com/' }));
    expect(await run('SEC-02', context({ http }))).toMatchObject({
      status: 'fail',
      severity: 'high',
    });
  });

  it('no aplica si el sitio no responde por HTTP', async () => {
    expect((await run('SEC-02', context({ http: failed('NETWORK_ERROR') }))).status).toBe('na');
  });
});

describe('SEC-03 certificado', () => {
  it.each([
    ['CERT_HAS_EXPIRED', /vencido/],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', /autofirmado/],
    ['SELF_SIGNED_CERT_IN_CHAIN', /autofirmado/],
    ['ERR_TLS_CERT_ALTNAME_INVALID', /no corresponde/],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', /cadena/],
    ['CERT_NOT_YET_VALID', /todavía no/],
    ['OTRO_ERROR_CERT', /no es válido/],
  ])('falla como crítico con %s', async (error, title) => {
    const f = await run(
      'SEC-03',
      context({ https: failed('TLS_ERROR', error), tls: { valid: false, error } }),
    );
    expect(f).toMatchObject({ status: 'fail', severity: 'critical' });
    expect(f.title).toMatch(title);
    expect(f.evidence).toContain(error);
  });

  it.each([
    [10, 'fail'],
    [20, 'warn'],
    [90, 'pass'],
  ])('vence en %i días → %s', async (days, status) => {
    const tls = { valid: true as const, ...GOOD_TLS, validTo: inDays(days) };
    const f = await run('SEC-03', context({ tls }));
    expect(f.status).toBe(status);
    if (status !== 'pass') expect(f.severity).toBe('high');
  });

  it('no aplica sin HTTPS o con un error de protocolo', async () => {
    expect((await run('SEC-03', context({ tls: null }))).status).toBe('na');
    const protocol = { valid: false as const, error: 'ERR_SSL_UNSUPPORTED_PROTOCOL' };
    expect((await run('SEC-03', context({ tls: protocol }))).status).toBe('na');
  });

  it('cumple si no se conoce el vencimiento pero el certificado se verificó', async () => {
    const tls = { valid: true as const, ...GOOD_TLS, validTo: null };
    expect((await run('SEC-03', context({ tls }))).status).toBe('pass');
  });
});

describe('SEC-04 versión de TLS', () => {
  it.each([
    ['TLSv1.3', 'pass'],
    ['TLSv1.2', 'pass'],
    ['TLSv1.1', 'fail'],
    ['TLSv1', 'fail'],
  ])('%s → %s', async (protocol, status) => {
    const f = await run('SEC-04', context({ tls: { valid: true, ...GOOD_TLS, protocol } }));
    expect(f.status).toBe(status);
  });

  it('falla si el servidor solo ofrece versiones viejas (error de protocolo)', async () => {
    const tls = { valid: false as const, error: 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION' };
    expect((await run('SEC-04', context({ tls }))).status).toBe('fail');
  });

  it('no aplica sin HTTPS, con un error de certificado o sin dato de versión', async () => {
    expect((await run('SEC-04', context({ tls: null }))).status).toBe('na');
    expect(
      (await run('SEC-04', context({ tls: { valid: false, error: 'CERT_HAS_EXPIRED' } }))).status,
    ).toBe('na');
    expect(
      (await run('SEC-04', context({ tls: { valid: true, ...GOOD_TLS, protocol: null } }))).status,
    ).toBe('na');
  });
});

describe('SEC-05 HSTS', () => {
  it.each([
    [{}, 'fail'],
    [{ 'strict-transport-security': 'includeSubDomains' }, 'fail'],
    [{ 'strict-transport-security': 'max-age=300' }, 'warn'],
    [{ 'strict-transport-security': 'max-age=15552000' }, 'pass'],
    [{ 'strict-transport-security': 'MAX-AGE="31536000"; preload' }, 'pass'],
  ])('%j → %s', async (headers, status) => {
    expect((await run('SEC-05', withHeaders(headers))).status).toBe(status);
  });

  it('no aplica sin HTTPS', async () => {
    expect((await run('SEC-05', context({ https: failed('NETWORK_ERROR') }))).status).toBe('na');
  });
});

describe('SEC-07 X-Content-Type-Options', () => {
  it.each([
    [{ 'x-content-type-options': 'nosniff' }, 'pass'],
    [{ 'x-content-type-options': 'NoSniff' }, 'pass'],
    [{ 'x-content-type-options': SECRET }, 'fail'],
    [{}, 'fail'],
  ])('%j → %s', async (headers, status) => {
    const f = await run('SEC-07', withHeaders(headers));
    expect(f.status).toBe(status);
    expect(f.evidence ?? '').not.toContain(SECRET);
  });
});

describe('SEC-08 clickjacking', () => {
  it.each([
    [{ 'x-frame-options': 'SAMEORIGIN' }, 'pass'],
    [{ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }, 'pass'],
    [{ 'x-frame-options': 'ALLOW-FROM https://otro.com' }, 'warn'],
    [{ 'x-frame-options': SECRET }, 'fail'],
    [{ 'content-security-policy': "default-src 'self'" }, 'fail'],
    [{}, 'fail'],
  ])('%j → %s', async (headers, status) => {
    const f = await run('SEC-08', withHeaders(headers));
    expect(f.status).toBe(status);
    expect(f.evidence ?? '').not.toContain(SECRET);
    expect(f.evidence ?? '').not.toContain('otro.com');
  });
});

describe('SEC-09 Referrer-Policy', () => {
  it.each([
    [{ 'referrer-policy': 'no-referrer' }, 'pass'],
    [{ 'referrer-policy': 'unsafe-url, strict-origin' }, 'pass'],
    [{ 'referrer-policy': 'unsafe-url' }, 'warn'],
    [{ 'referrer-policy': 'no-referrer-when-downgrade' }, 'warn'],
    [{ 'referrer-policy': SECRET }, 'warn'],
    [{}, 'warn'],
  ])('%j → %s', async (headers, status) => {
    const f = await run('SEC-09', withHeaders(headers));
    expect(f.status).toBe(status);
    expect(f.evidence ?? '').not.toContain(SECRET);
  });
});

describe('cabeceras repetidas y respuesta principal ausente', () => {
  it('une cabeceras repetidas', async () => {
    const f = await run('SEC-07', withHeaders({ 'x-content-type-options': ['nosniff'] }));
    expect(f.status).toBe('pass');
  });

  it('los checks de cabeceras no aplican sin respuesta principal', async () => {
    const ctx = context({
      https: failed('NETWORK_ERROR'),
      http: failed('NETWORK_ERROR'),
      primary: null,
    });
    for (const id of ['SEC-07', 'SEC-08', 'SEC-09']) {
      expect((await run(id, ctx)).status).toBe('na');
    }
  });
});
