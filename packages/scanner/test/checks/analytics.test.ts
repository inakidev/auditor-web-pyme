import type { Finding } from '@auditor/shared';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_CHECKS } from '../../src/checks/index.js';
import { context } from './fixtures.js';

// Checks de analítica (RF-05): solo se lee el HTML inicial, nunca se ejecuta JavaScript.

async function run(id: string, html: string | null): Promise<Finding> {
  const check = ANALYTICS_CHECKS.find((c) => c.id === id);
  if (check === undefined) throw new Error(`Falta ${id}`);
  const [finding] = (await check.run(context({ html: html === null ? null : load(html) }))) as [
    Finding,
  ];
  expect(finding.category).toBe('analytics');
  return finding;
}

const GA4 =
  '<script async src="https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF"></script>';
const GTM =
  "<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC1234');</script>";
const MATOMO = '<script>var _paq = window._paq = []; _paq.push(["trackPageView"]);</script>';
const PLAUSIBLE =
  '<script defer data-domain="ejemplo.com" src="https://plausible.io/js/script.js"></script>';
const UA = "<script>ga('create', 'UA-1234567-1', 'auto');</script>";
const PIXEL = "<script>fbq('init', '123456789012345');</script>";
const CMP = '<script src="https://consent.cookiebot.com/uc.js"></script>';
const BANNER = '<div id="cookie-consent">Usamos cookies</div>';

describe('catálogo', () => {
  it('incluye ANA-01 a ANA-05', () => {
    expect(ANALYTICS_CHECKS.map((c) => c.id)).toEqual([
      'ANA-01',
      'ANA-02',
      'ANA-03',
      'ANA-04',
      'ANA-05',
    ]);
  });

  it('sin HTML quedan como no evaluados', async () => {
    for (const check of ANALYTICS_CHECKS) {
      expect((await run(check.id, null)).status).toBe('not_evaluated');
    }
  });
});

describe('ANA-01 medición', () => {
  it.each([
    [GA4, 'GA4'],
    [GTM, 'Google Tag Manager'],
    [MATOMO, 'Matomo'],
    [PLAUSIBLE, 'Plausible'],
  ])('detecta %s', async (html, name) => {
    const f = await run('ANA-01', html);
    expect(f.status).toBe('pass');
    expect(f.evidence).toContain(name);
  });

  it('no muestra los IDs de medición en la evidencia', async () => {
    const f = await run('ANA-01', GA4 + GTM);
    expect(f.evidence).not.toContain('G-AB12CD34EF');
    expect(f.evidence).not.toContain('GTM-ABC1234');
  });

  it('sin medición: falla, redactado como "no detectamos en el HTML inicial"', async () => {
    const f = await run('ANA-01', '<p>hola</p>');
    expect(f).toMatchObject({ status: 'fail', severity: 'high' });
    expect(f.title).toMatch(/no detectamos/i);
    expect(f.title).toMatch(/HTML inicial/);
  });

  it('sin medición pero con aviso de cookies: advierte (podría cargarse tras aceptar)', async () => {
    expect((await run('ANA-01', CMP)).status).toBe('warn');
    expect((await run('ANA-01', BANNER)).status).toBe('warn');
  });
});

describe('ANA-02 a ANA-05', () => {
  it('ANA-02 Universal Analytics obsoleto', async () => {
    expect(await run('ANA-02', UA)).toMatchObject({ status: 'fail', severity: 'medium' });
    expect((await run('ANA-02', GA4)).status).toBe('pass');
    expect((await run('ANA-02', '<p></p>')).status).toBe('na');
  });

  it('ANA-03 Meta Pixel', async () => {
    expect((await run('ANA-03', PIXEL)).status).toBe('pass');
    expect(
      (
        await run(
          'ANA-03',
          '<script src="https://connect.facebook.net/es_LA/fbevents.js"></script>',
        )
      ).status,
    ).toBe('pass');
    expect((await run('ANA-03', '<p></p>')).status).toBe('na');
  });

  it('ANA-04 aviso de cookies con trackers (heurística, con cautela)', async () => {
    const f = await run('ANA-04', GA4);
    expect(f.status).toBe('warn');
    expect(f.title).toMatch(/verificalo/);
    expect((await run('ANA-04', GA4 + CMP)).status).toBe('pass');
    expect((await run('ANA-04', '<p></p>')).status).toBe('na');
  });

  it('ANA-05 enlaces de contacto medibles', async () => {
    const html =
      '<a href="tel:+5492804000000">Llamar</a><a href="https://wa.me/5492804000000">WhatsApp</a>';
    const f = await run('ANA-05', html);
    expect(f.status).toBe('pass');
    expect(f.evidence).toMatch(/teléfono/);
    expect(f.evidence).toMatch(/WhatsApp/);
    expect(f.evidence).not.toContain('2804000000');
    expect((await run('ANA-05', '<a href="/contacto">Contacto</a>')).status).toBe('warn');
  });
});
