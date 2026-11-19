import type { Finding } from '@auditor/shared';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import type { AuditContext } from '../../src/audit/context.js';
import { SECURITY_CHECKS } from '../../src/checks/index.js';
import { context, ok, response } from './fixtures.js';

// SEC-06 y SEC-10 a SEC-16 (RF-03), con fixtures y sin red.

async function run(id: string, ctx: AuditContext): Promise<Finding> {
  const check = SECURITY_CHECKS.find((c) => c.id === id);
  if (check === undefined) throw new Error(`Falta ${id}`);
  const [finding] = (await check.run(ctx)) as [Finding];
  expect(finding.checkId).toBe(id);
  expect((finding.evidence ?? '').length).toBeLessThanOrEqual(300);
  return finding;
}

const SECRET = 'valor-secreto-xyz';

/** Portada HTTPS con cabeceras y HTML dados. */
function page(
  headers: Record<string, string | string[]> = {},
  html = '<html></html>',
  url = 'https://ejemplo.com/',
): AuditContext {
  const res = response({ url, headers });
  return context({ https: ok(res), primary: res, html: load(html) });
}

describe('catálogo de seguridad completo', () => {
  it('incluye SEC-01 a SEC-16', () => {
    expect(SECURITY_CHECKS.map((c) => c.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `SEC-${String(i + 1).padStart(2, '0')}`),
    );
  });
});

describe('SEC-06 Content-Security-Policy', () => {
  it.each([
    [{}, 'fail'],
    [{ 'content-security-policy': "default-src 'self'; script-src 'self'" }, 'pass'],
    [
      { 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'" },
      'warn',
    ],
    [{ 'content-security-policy': "script-src * 'unsafe-eval'" }, 'warn'],
    [{ 'content-security-policy': "img-src 'self'" }, 'warn'],
  ])('%j → %s', async (headers, status) => {
    expect((await run('SEC-06', page(headers))).status).toBe(status);
  });

  it('la evidencia no copia orígenes de la política', async () => {
    const f = await run(
      'SEC-06',
      page({
        'content-security-policy': `default-src 'self' https://${SECRET}.com 'unsafe-inline'`,
      }),
    );
    expect(f.evidence ?? '').not.toContain(SECRET);
  });
});

describe('SEC-10 Permissions-Policy', () => {
  it('cumple si existe y advierte si falta', async () => {
    expect(
      (await run('SEC-10', page({ 'permissions-policy': 'camera=(), geolocation=()' }))).status,
    ).toBe('pass');
    expect((await run('SEC-10', page({}))).status).toBe('warn');
  });
});

describe('SEC-11 cookies', () => {
  it('no aplica sin cookies', async () => {
    expect((await run('SEC-11', page({}))).status).toBe('na');
  });

  it('cumple con Secure, HttpOnly y SameSite', async () => {
    const f = await run(
      'SEC-11',
      page({ 'set-cookie': [`sesion=${SECRET}; Path=/; Secure; HttpOnly; SameSite=Lax`] }),
    );
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain('sesion');
    expect(f.evidence).not.toContain(SECRET);
  });

  it('falla sin Secure en un sitio HTTPS y advierte sin SameSite o HttpOnly', async () => {
    expect(
      (await run('SEC-11', page({ 'set-cookie': [`a=${SECRET}; HttpOnly; SameSite=Lax`] }))).status,
    ).toBe('fail');
    const warn = await run('SEC-11', page({ 'set-cookie': [`a=${SECRET}; Secure`] }));
    expect(warn.status).toBe('warn');
    expect(warn.evidence).not.toContain(SECRET);
  });
});

describe('SEC-12 divulgación de versiones', () => {
  it.each([
    [{ server: 'Vercel' }, '', 'pass'],
    [{ server: 'nginx/1.18.0' }, '', 'fail'],
    [{ 'x-powered-by': 'PHP/7.4.3' }, '', 'fail'],
    [{}, '<meta name="generator" content="WordPress 6.4.2">', 'fail'],
    [{}, '<meta name="generator" content="Wix.com Website Builder">', 'pass'],
  ])('%j %s → %s', async (headers, head, status) => {
    const f = await run('SEC-12', page(headers, `<html><head>${head}</head></html>`));
    expect(f.status).toBe(status);
    expect(f.evidence ?? '').not.toMatch(/\d+\.\d+/);
  });
});

describe('SEC-13 contenido mixto', () => {
  it('detecta recursos http:// en una página HTTPS sin mostrar la query', async () => {
    const html = `<img src="http://cdn.ejemplo.com/a.png?k=${SECRET}"><script src="https://ok.com/x.js"></script><link rel="stylesheet" href="http://ejemplo.com/e.css">`;
    const f = await run('SEC-13', page({}, html));
    expect(f.status).toBe('fail');
    expect(f.evidence).toContain('2 recursos');
    expect(f.evidence).not.toContain(SECRET);
  });

  it('cumple sin recursos inseguros y no aplica en páginas HTTP', async () => {
    expect((await run('SEC-13', page({}, '<img src="/a.png">'))).status).toBe('pass');
    expect(
      (await run('SEC-13', page({}, '<img src="http://x.com/a.png">', 'http://ejemplo.com/')))
        .status,
    ).toBe('na');
  });
});

describe('SEC-14 formularios inseguros', () => {
  it('falla si un formulario envía a http:// o pide contraseña sin HTTPS', async () => {
    expect(
      (
        await run(
          'SEC-14',
          page({}, '<form action="http://ejemplo.com/enviar"><input name="q"></form>'),
        )
      ).status,
    ).toBe('fail');
    expect(
      (await run('SEC-14', page({}, '<form><input type="password"></form>', 'http://ejemplo.com/')))
        .status,
    ).toBe('fail');
  });

  it('cumple con formularios seguros y no aplica sin formularios', async () => {
    expect(
      (await run('SEC-14', page({}, '<form action="/enviar"><input type="password"></form>')))
        .status,
    ).toBe('pass');
    expect((await run('SEC-14', page({}, '<p></p>'))).status).toBe('na');
  });
});

describe('SEC-15 Subresource Integrity', () => {
  it('advierte scripts de terceros sin integrity', async () => {
    const html =
      '<script src="https://cdn.otro.com/lib.js"></script><script src="/propio.js"></script>';
    const f = await run('SEC-15', page({}, html));
    expect(f.status).toBe('warn');
    expect(f.evidence).toContain('cdn.otro.com');
  });

  it('cumple con integrity y no aplica sin scripts de terceros', async () => {
    expect(
      (
        await run(
          'SEC-15',
          page({}, '<script src="https://cdn.otro.com/lib.js" integrity="sha384-x"></script>'),
        )
      ).status,
    ).toBe('pass');
    expect((await run('SEC-15', page({}, '<script src="/propio.js"></script>'))).status).toBe('na');
  });
});

describe('SEC-16 security.txt', () => {
  it.each([
    [{ kind: 'found', hasContact: true }, 'pass'],
    [{ kind: 'found', hasContact: false }, 'warn'],
    [{ kind: 'missing' }, 'warn'],
    [{ kind: 'error', code: 'TIMEOUT' }, 'not_evaluated'],
  ] as const)('%j → %s', async (securityTxt, status) => {
    expect((await run('SEC-16', context({ securityTxt }))).status).toBe(status);
  });
});

describe('sin HTML', () => {
  it('los checks que leen el HTML quedan como no evaluados', async () => {
    const ctx = context({ html: null });
    for (const id of ['SEC-12', 'SEC-13', 'SEC-14', 'SEC-15']) {
      expect((await run(id, ctx)).status, id).toBe('not_evaluated');
    }
  });
});
