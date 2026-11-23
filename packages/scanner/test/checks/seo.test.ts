import type { Finding } from '@auditor/shared';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import type { AuditContext } from '../../src/audit/context.js';
import { PERFORMANCE_CHECKS, SEO_CHECKS } from '../../src/checks/index.js';
import { parseRobots } from '../../src/crawl/robots.js';
import { context, ok, response } from './fixtures.js';

// Checks de SEO y rendimiento liviano (RF-04), con fixtures y sin red.

const ALL = [...SEO_CHECKS, ...PERFORMANCE_CHECKS];

async function run(id: string, ctx: AuditContext): Promise<Finding> {
  const check = ALL.find((c) => c.id === id);
  if (check === undefined) throw new Error(`Falta ${id}`);
  const [finding] = (await check.run(ctx)) as [Finding];
  expect(finding.checkId).toBe(id);
  expect((finding.evidence ?? '').length).toBeLessThanOrEqual(300);
  return finding;
}

const page = (head: string, body = '', lang = 'es') =>
  context({
    html: load(
      `<!doctype html><html lang="${lang}"><head>${head}</head><body>${body}</body></html>`,
    ),
  });

const GOOD_HEAD = `
  <title>Clínica del Sur: turnos y especialidades en Trelew</title>
  <meta name="description" content="Pedí tu turno online en la Clínica del Sur. Atendemos todas las especialidades con los mejores profesionales de la zona.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://ejemplo.com/">
  <meta property="og:title" content="Clínica del Sur"><meta property="og:description" content="Turnos online">
  <meta property="og:image" content="https://ejemplo.com/og.png"><meta name="twitter:card" content="summary">
  <script type="application/ld+json">{"@type":"MedicalClinic"}</script>`;

describe('catálogo', () => {
  it('incluye SEO-01 a SEO-15 y PER-01 a PER-03', () => {
    expect(SEO_CHECKS.map((c) => c.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `SEO-${String(i + 1).padStart(2, '0')}`),
    );
    expect(PERFORMANCE_CHECKS.map((c) => c.id)).toEqual(['PER-01', 'PER-02', 'PER-03']);
  });

  it('sin HTML, los checks de contenido quedan como no evaluados', async () => {
    expect((await run('SEO-01', context({ html: null }))).status).toBe('not_evaluated');
  });
});

describe('contenido de la portada', () => {
  it('una página bien armada cumple', async () => {
    const ctx = page(GOOD_HEAD, '<h1>Clínica del Sur</h1><img src="a.png" alt="Fachada">');
    for (const id of [
      'SEO-01',
      'SEO-02',
      'SEO-03',
      'SEO-04',
      'SEO-05',
      'SEO-06',
      'SEO-07',
      'SEO-08',
      'SEO-11',
      'SEO-14',
    ]) {
      expect((await run(id, ctx)).status, id).toBe('pass');
    }
  });

  it.each([
    ['', 'fail'],
    ['<title>Inicio</title>', 'warn'],
    [`<title>${'Muy largo '.repeat(10)}</title>`, 'warn'],
  ])('SEO-01 title %s → %s', async (head, status) => {
    expect((await run('SEO-01', page(head))).status).toBe(status);
  });

  it.each([
    ['', 'fail'],
    ['<meta name="description" content="Corta">', 'warn'],
  ])('SEO-02 description → %s', async (head, status) => {
    expect((await run('SEO-02', page(head))).status).toBe(status);
  });

  it.each([
    ['', 'fail'],
    ['<h1>A</h1><h1>B</h1>', 'warn'],
  ])('SEO-03 H1 → %s', async (body, status) => {
    expect((await run('SEO-03', page('', body))).status).toBe(status);
  });

  it('SEO-04 sin canonical o apuntando a otro dominio', async () => {
    expect((await run('SEO-04', page(''))).status).toBe('fail');
    expect(
      (await run('SEO-04', page('<link rel="canonical" href="https://otro.com/x?a=1">'))).status,
    ).toBe('warn');
  });

  it('SEO-05 sin lang falla', async () => {
    const ctx = context({ html: load('<html><head><title>Hola</title></head></html>') });
    expect((await run('SEO-05', ctx)).status).toBe('fail');
  });

  it('SEO-05 página en inglés con la descripción en español: advierte con cautela', async () => {
    const head = `<title>Welcome to our clinic, the best services for you and your family</title>
      <meta name="description" content="Pedí tu turno online con los mejores profesionales de la zona y de la provincia">`;
    const f = await run('SEO-05', page(head, '', 'en'));
    expect(f.status).toBe('warn');
    expect(f.title).toMatch(/verificalo/);
  });

  it('SEO-05 idioma declarado distinto del contenido: advierte', async () => {
    const head = `<title>Turnos online para la clínica y todos los servicios de la zona</title>`;
    expect((await run('SEO-05', page(head, '', 'en'))).status).toBe('warn');
  });

  it.each([
    ['', 'fail'],
    ['<meta name="viewport" content="initial-scale=1">', 'warn'],
  ])('SEO-06 viewport → %s', async (head, status) => {
    expect((await run('SEO-06', page(head))).status).toBe(status);
  });

  it.each([
    ['', 'fail'],
    ['<meta property="og:title" content="x">', 'warn'],
  ])('SEO-07 etiquetas sociales → %s', async (head, status) => {
    expect((await run('SEO-07', page(head))).status).toBe(status);
  });

  it('SEO-07 recomienda agregar solo las etiquetas que faltan', async () => {
    const parcial = await run(
      'SEO-07',
      page('<meta property="og:title" content="x"><meta property="og:description" content="y">'),
    );
    expect(parcial.recommendation).toMatch(/^Agregá og:image para/);
    expect((await run('SEO-07', page(''))).recommendation).toMatch(
      /^Agregá og:title, og:description y og:image para/,
    );
  });

  it.each([
    ['', 'na'],
    ['<img src="a"><img src="b" alt="">', 'warn'],
    ['<img src="a"><img src="b"><img src="c">', 'fail'],
  ])('SEO-08 imágenes con alt %s → %s', async (body, status) => {
    expect((await run('SEO-08', page('', body))).status).toBe(status);
  });

  it('SEO-11 detecta noindex en meta o en X-Robots-Tag', async () => {
    expect(
      await run('SEO-11', page('<meta name="robots" content="noindex, follow">')),
    ).toMatchObject({
      status: 'fail',
      severity: 'critical',
    });
    const header = context({
      html: load('<html></html>'),
      primary: response({ url: 'https://ejemplo.com/', headers: { 'x-robots-tag': 'noindex' } }),
    });
    expect((await run('SEO-11', header)).status).toBe('fail');
  });

  it('SEO-13 hreflang: no aplica sin variantes; advierte con códigos inválidos', async () => {
    expect((await run('SEO-13', page(''))).status).toBe('na');
    const okHead =
      '<link rel="alternate" hreflang="es-AR" href="https://ejemplo.com/"><link rel="alternate" hreflang="en" href="https://ejemplo.com/en/">';
    expect((await run('SEO-13', page(okHead))).status).toBe('pass');
    const bad = '<link rel="alternate" hreflang="español" href="/es">';
    expect((await run('SEO-13', page(bad))).status).toBe('warn');
  });

  it('SEO-14 JSON-LD inválido o ausente advierte', async () => {
    expect(
      (await run('SEO-14', page('<script type="application/ld+json">{roto</script>'))).status,
    ).toBe('warn');
    expect((await run('SEO-14', page(''))).status).toBe('warn');
  });
});

describe('robots, sitemap, enlaces y favicon', () => {
  it('SEO-09', async () => {
    expect((await run('SEO-09', context({ robots: { kind: 'missing' } }))).status).toBe('warn');
    const blocks = parseRobots('User-agent: *\nDisallow: /');
    expect(
      await run('SEO-09', context({ robots: { kind: 'found', robots: blocks } })),
    ).toMatchObject({
      status: 'fail',
      severity: 'critical',
    });
    const fine = parseRobots('User-agent: *\nDisallow: /admin');
    expect((await run('SEO-09', context({ robots: { kind: 'found', robots: fine } }))).status).toBe(
      'pass',
    );
    expect(
      (await run('SEO-09', context({ robots: { kind: 'error', code: 'TIMEOUT' } }))).status,
    ).toBe('not_evaluated');
  });

  it('SEO-10', async () => {
    expect((await run('SEO-10', context({ sitemap: { kind: 'found' } }))).status).toBe('pass');
    const other = await run(
      'SEO-10',
      context({
        sitemap: { kind: 'declared', urls: ['https://cdn.otro.com/m.xml'], otherHost: true },
      }),
    );
    expect(other.status).toBe('pass');
    expect(other.evidence).toMatch(/otro dominio/);
    expect((await run('SEO-10', context({ sitemap: { kind: 'missing' } }))).status).toBe('fail');
    expect(
      (await run('SEO-10', context({ sitemap: { kind: 'error', code: 'TIMEOUT' } }))).status,
    ).toBe('not_evaluated');
  });

  it('SEO-12', async () => {
    const ok200 = {
      url: 'https://ejemplo.com/a',
      outcome: 'ok',
      status: 200,
      reason: null,
    } as const;
    const broken = {
      url: 'https://ejemplo.com/roto',
      outcome: 'broken',
      status: 404,
      reason: null,
    } as const;
    const skipped = {
      url: 'https://ejemplo.com/x',
      outcome: 'not_verified',
      status: null,
      reason: 'budget',
    } as const;
    expect(
      (await run('SEO-12', context({ links: { found: 0, results: [], budgetExhausted: false } })))
        .status,
    ).toBe('na');
    const fail = await run(
      'SEO-12',
      context({ links: { found: 3, results: [ok200, broken, skipped], budgetExhausted: true } }),
    );
    expect(fail.status).toBe('fail');
    expect(fail.evidence).toContain('https://ejemplo.com/roto');
    expect(fail.evidence).toMatch(/verificamos 2 de 3/);
    expect(
      (
        await run(
          'SEO-12',
          context({ links: { found: 1, results: [ok200], budgetExhausted: false } }),
        )
      ).status,
    ).toBe('pass');
    expect(
      (
        await run(
          'SEO-12',
          context({ links: { found: 1, results: [skipped], budgetExhausted: true } }),
        )
      ).status,
    ).toBe('not_evaluated');
  });

  it('SEO-15', async () => {
    expect((await run('SEO-15', context({ favicon: { kind: 'found' } }))).status).toBe('pass');
    expect((await run('SEO-15', context({ favicon: { kind: 'missing' } }))).status).toBe('warn');
    expect(
      (await run('SEO-15', context({ favicon: { kind: 'error', code: 'TIMEOUT' } }))).status,
    ).toBe('not_evaluated');
  });
});

describe('rendimiento liviano', () => {
  const withRes = (over: Partial<ReturnType<typeof response>>) =>
    context({
      html: load('<html><script src="a.js"></script><script>1</script></html>'),
      https: ok({ ...response({ url: 'https://ejemplo.com/' }), ...over }),
    });

  it('PER-01 compresión', async () => {
    expect(
      (await run('PER-01', withRes({ contentEncoding: 'br', body: Buffer.alloc(5000) }))).status,
    ).toBe('pass');
    expect(
      (await run('PER-01', withRes({ contentEncoding: null, body: Buffer.alloc(5000) }))).status,
    ).toBe('fail');
    expect(
      (await run('PER-01', withRes({ contentEncoding: null, body: Buffer.alloc(100) }))).status,
    ).toBe('na');
  });

  it.each([
    [300, 'pass'],
    [1200, 'warn'],
    [2500, 'fail'],
  ])('PER-02 TTFB %i ms → %s, medido desde nuestro servidor', async (ttfbMs, status) => {
    const f = await run('PER-02', withRes({ timings: { ttfbMs, totalMs: ttfbMs + 10 } }));
    expect(f.status).toBe(status);
    expect(f.evidence).toMatch(/medido desde nuestro servidor/);
  });

  it('PER-03 peso y scripts', async () => {
    const f = await run('PER-03', withRes({ rawBytes: 2048, body: Buffer.alloc(8192) }));
    expect(f.status).toBe('pass');
    expect(f.evidence).toMatch(/2 scripts/);
    expect(
      (await run('PER-03', withRes({ rawBytes: 900_000, body: Buffer.alloc(900_000) }))).status,
    ).toBe('warn');
  });

  it('sin respuesta HTTPS, rendimiento no evaluado', async () => {
    const ctx = context({ https: { ok: false, code: 'TIMEOUT', detail: null } });
    for (const id of ['PER-01', 'PER-02', 'PER-03']) {
      expect((await run(id, ctx)).status).toBe('not_evaluated');
    }
  });
});
