import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import {
  collectExtras,
  FALLBACK_BODY_BYTES,
  LINK_BUDGET_MS,
  MAX_LINKS,
} from '../../src/crawl/collect.js';
import { HostScheduler } from '../../src/crawl/host-scheduler.js';
import type { SafeFetch, SafeFetchOptions } from '../../src/net/create-safe-fetch.js';
import { SafeFetchError } from '../../src/net/errors.js';
import { response } from '../checks/fixtures.js';
import { createFakeClock } from '../support/fake-clock.js';

const PRIMARY = response({ url: 'https://ejemplo.com/' });

type Route = { status?: number; body?: string; headers?: Record<string, string> } | Error;

/** Rutas por URL o por "MÉTODO URL". El reloj avanza en fracciones (D-01). */
function setup(routes: Record<string, Route>, opts: { stepMs?: number } = {}) {
  const clock = createFakeClock();
  const calls: string[] = [];
  const seenOptions: SafeFetchOptions[] = [];
  const fetch = vi.fn<SafeFetch>((url: string, options: SafeFetchOptions) => {
    const method = options.method ?? 'GET';
    calls.push(`${method} ${url}`);
    seenOptions.push(options);
    clock.advance(opts.stepMs ?? 0);
    const route = routes[`${method} ${url}`] ?? routes[url];
    if (route instanceof Error) return Promise.reject(route);
    if (route === undefined) return Promise.resolve(response({ url, status: 200 }));
    const res = response({ url, status: route.status ?? 200, headers: route.headers ?? {} });
    return Promise.resolve({ ...res, body: Buffer.from(route.body ?? '') });
  });
  const deps = {
    fetch,
    contactUrl: 'https://example.invalid/contacto',
    now: clock.now,
    scheduler: new HostScheduler({ intervalMs: 0, now: clock.now, sleep: clock.sleep }),
    timeoutSignal: (ms: number) => AbortSignal.timeout(ms),
  };
  return { deps, calls, seenOptions };
}

const ROBOTS = (body: string): Route => ({ body, headers: { 'content-type': 'text/plain' } });

describe('collectExtras', () => {
  it('el GET de respaldo (solo tras 405/501) baja apenas unos KB', async () => {
    const { deps, seenOptions } = setup({
      'https://ejemplo.com/robots.txt': { status: 404 },
      'HEAD https://ejemplo.com/a': { status: 405 },
      'GET https://ejemplo.com/a': { status: 404 },
    });
    const html = load('<link rel="icon" href="/i.png"><a href="/a">A</a>');
    const extras = await collectExtras(PRIMARY, html, deps);
    expect(extras.links.results[0]).toMatchObject({ outcome: 'broken', status: 404 });
    // Solo dos pedidos con tope reducido: security.txt y el GET de respaldo del enlace.
    const capped = seenOptions.filter((o) => o.maxBodyBytes !== undefined);
    expect(capped.map((o) => [o.method, o.maxBodyBytes])).toEqual([
      ['GET', FALLBACK_BODY_BYTES],
      ['GET', FALLBACK_BODY_BYTES],
    ]);
  });

  it('robots, sitemap declarado, favicon declarado y enlaces filtrados', async () => {
    const html = load(`
      <link rel="icon" href="/favicon.png">
      <a href="/a">A</a><a href="/a#seccion">A otra vez</a>
      <a href="/privado/x">Privado</a><a href="mailto:hola@ejemplo.com">Mail</a>
      <a href="tel:+5492800000000">Tel</a><a href="#arriba">Arriba</a>
      <a href="https://otro.com/">Externo</a><a href="javascript:void(0)">JS</a>
      <a href="/roto">Roto</a><a href="/b?token=secreto">B</a><a href="/metodo">M</a><a href="/nunca">N</a>
      <a href="/">Inicio</a>`);
    const { deps, calls } = setup({
      'https://ejemplo.com/robots.txt': ROBOTS(
        'User-agent: *\nDisallow: /privado\nSitemap: https://ejemplo.com/sitemap.xml',
      ),
      'https://ejemplo.com/roto': { status: 404 },
      'HEAD https://ejemplo.com/metodo': { status: 405 },
      'GET https://ejemplo.com/metodo': { status: 200 },
      'https://ejemplo.com/nunca': { status: 501 },
    });
    const extras = await collectExtras(PRIMARY, html, deps);

    expect(extras.robots.kind).toBe('found');
    expect(extras.sitemap).toEqual({
      kind: 'declared',
      urls: ['https://ejemplo.com/sitemap.xml'],
      otherHost: false,
    });
    expect(extras.favicon).toEqual({ kind: 'declared' });
    expect(calls).toEqual([
      'GET https://ejemplo.com/robots.txt',
      'GET https://ejemplo.com/.well-known/security.txt',
      'HEAD https://ejemplo.com/a',
      'HEAD https://ejemplo.com/roto',
      'HEAD https://ejemplo.com/b?token=secreto',
      'HEAD https://ejemplo.com/metodo',
      'GET https://ejemplo.com/metodo',
      'HEAD https://ejemplo.com/nunca',
      'GET https://ejemplo.com/nunca',
    ]);
    expect(extras.links.found).toBe(6);
    expect(extras.links.results).toEqual([
      { url: 'https://ejemplo.com/a', outcome: 'ok', status: 200, reason: null },
      {
        url: 'https://ejemplo.com/privado/x',
        outcome: 'not_verified',
        status: null,
        reason: 'robots',
      },
      { url: 'https://ejemplo.com/roto', outcome: 'broken', status: 404, reason: null },
      { url: 'https://ejemplo.com/b', outcome: 'ok', status: 200, reason: null },
      { url: 'https://ejemplo.com/metodo', outcome: 'ok', status: 200, reason: null },
      { url: 'https://ejemplo.com/nunca', outcome: 'not_verified', status: 501, reason: 'method' },
    ]);
  });

  it('sin robots.txt ni íconos declarados, verifica sitemap.xml y favicon.ico con HEAD', async () => {
    const { deps, calls } = setup({
      'https://ejemplo.com/robots.txt': { status: 404 },
      'https://ejemplo.com/favicon.ico': { status: 404 },
    });
    const extras = await collectExtras(PRIMARY, load('<p>sin enlaces</p>'), deps);
    expect(extras.robots).toEqual({ kind: 'missing' });
    expect(extras.sitemap).toEqual({ kind: 'found' });
    expect(extras.favicon).toEqual({ kind: 'missing' });
    expect(calls).toEqual([
      'GET https://ejemplo.com/robots.txt',
      'HEAD https://ejemplo.com/sitemap.xml',
      'HEAD https://ejemplo.com/favicon.ico',
      'GET https://ejemplo.com/.well-known/security.txt',
    ]);
  });

  it('security.txt: se pide con GET de 8 KB y se busca Contact', async () => {
    const { deps, seenOptions } = setup({
      'https://ejemplo.com/robots.txt': { status: 404 },
      'https://ejemplo.com/.well-known/security.txt': ROBOTS(
        'Contact: mailto:seguridad@ejemplo.com\nExpires: 2027-01-01T00:00:00Z',
      ),
    });
    const extras = await collectExtras(PRIMARY, load('<link rel="icon" href="/i.png">'), deps);
    expect(extras.securityTxt).toEqual({ kind: 'found', hasContact: true });
    const sec = seenOptions.find((o) => o.maxBodyBytes !== undefined);
    expect(sec?.maxBodyBytes).toBe(FALLBACK_BODY_BYTES);
  });

  it('security.txt ausente o devuelto como HTML cuenta como inexistente', async () => {
    const { deps } = setup({
      'https://ejemplo.com/robots.txt': { status: 404 },
      'https://ejemplo.com/.well-known/security.txt': {
        body: '<html>',
        headers: { 'content-type': 'text/html' },
      },
    });
    expect((await collectExtras(PRIMARY, null, deps)).securityTxt).toEqual({ kind: 'missing' });
  });

  it('un robots.txt que devuelve HTML se toma como inexistente', async () => {
    const { deps } = setup({
      'https://ejemplo.com/robots.txt': {
        body: '<html>',
        headers: { 'content-type': 'text/html' },
      },
    });
    expect((await collectExtras(PRIMARY, null, deps)).robots).toEqual({ kind: 'missing' });
  });

  it('un sitemap declarado en otro host no se descarga, solo se informa', async () => {
    const { deps, calls } = setup({
      'https://ejemplo.com/robots.txt': ROBOTS('Sitemap: https://cdn.otro.com/mapa.xml?k=1'),
    });
    const extras = await collectExtras(PRIMARY, null, deps);
    expect(extras.sitemap).toEqual({
      kind: 'declared',
      urls: ['https://cdn.otro.com/mapa.xml'],
      otherHost: true,
    });
    expect(calls.some((c) => c.includes('otro.com'))).toBe(false);
  });

  it('si robots.txt no se pudo leer, no verifica enlaces (no verificado, no roto)', async () => {
    const { deps, calls } = setup({
      'https://ejemplo.com/robots.txt': new SafeFetchError('TIMEOUT', 'x'),
    });
    const extras = await collectExtras(PRIMARY, load('<a href="/a">A</a>'), deps);
    expect(extras.robots).toEqual({ kind: 'error', code: 'TIMEOUT' });
    expect(extras.links.results).toEqual([
      { url: 'https://ejemplo.com/a', outcome: 'not_verified', status: null, reason: 'robots' },
    ]);
    expect(calls.filter((c) => c.startsWith('HEAD https://ejemplo.com/a'))).toEqual([]);
  });

  it('respeta el presupuesto de la fase de enlaces', async () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="/p${String(i)}">p</a>`).join('');
    const { deps } = setup(
      { 'https://ejemplo.com/robots.txt': { status: 404 } },
      { stepMs: LINK_BUDGET_MS / 2 },
    );
    const extras = await collectExtras(
      PRIMARY,
      load(`<link rel="icon" href="/i.png">${links}`),
      deps,
    );
    expect(extras.links.budgetExhausted).toBe(true);
    const outcomes = extras.links.results.map((r) => r.reason ?? r.outcome);
    expect(outcomes.filter((o) => o === 'budget').length).toBeGreaterThan(0);
    expect(outcomes[0]).toBe('ok');
  });

  it('verifica como máximo 20 enlaces', async () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/p${String(i)}">p</a>`).join('');
    const { deps } = setup({ 'https://ejemplo.com/robots.txt': { status: 404 } });
    const extras = await collectExtras(
      PRIMARY,
      load(`<link rel="icon" href="/i.png">${links}`),
      deps,
    );
    expect(extras.links.found).toBe(30);
    expect(extras.links.results).toHaveLength(MAX_LINKS);
  });

  it('un error de red al verificar un enlace lo deja como no verificado', async () => {
    const { deps } = setup({
      'https://ejemplo.com/robots.txt': { status: 404 },
      'https://ejemplo.com/a': new SafeFetchError('NETWORK_ERROR', 'x'),
      'https://ejemplo.com/caido': { status: 503 },
      'https://ejemplo.com/login': { status: 401 },
    });
    const html = load(
      '<link rel="icon" href="/i.png"><a href="/a">A</a><a href="/caido">C</a><a href="/login">L</a>',
    );
    const results = (await collectExtras(PRIMARY, html, deps)).links.results;
    expect(results.map((r) => [r.outcome, r.reason])).toEqual([
      ['not_verified', 'error'],
      ['broken', null],
      ['not_verified', 'auth'],
    ]);
  });

  it('con un reloj monotónico fraccionario, el deadline de cada request es un entero (defecto D-01)', async () => {
    const { deps } = setup({ 'https://ejemplo.com/robots.txt': { status: 404 } }, { stepMs: 0.37 });
    const received: number[] = [];
    const extras = await collectExtras(
      PRIMARY,
      load('<link rel="icon" href="/i.png"><a href="/a">A</a>'),
      {
        ...deps,
        // Como performance.now(): cada lectura avanza una fracción de milisegundo.
        now: (() => {
          let t = 0;
          return () => (t += 0.37);
        })(),
        timeoutSignal: (ms: number) => {
          received.push(ms);
          return AbortSignal.timeout(ms);
        },
      },
    );
    expect(extras.links.results[0]?.outcome).toBe('ok');
    expect(received.every((ms) => Number.isInteger(ms))).toBe(true);
  });
});
