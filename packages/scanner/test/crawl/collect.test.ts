import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { collectExtras, LINK_BUDGET_MS, MAX_LINKS } from '../../src/crawl/collect.js';
import { HostScheduler } from '../../src/crawl/host-scheduler.js';
import type { SafeFetch, SafeFetchOptions } from '../../src/net/create-safe-fetch.js';
import { SafeFetchError } from '../../src/net/errors.js';
import { response } from '../checks/fixtures.js';

const PRIMARY = response({ url: 'https://ejemplo.com/' });

type Route = { status?: number; body?: string; headers?: Record<string, string> } | Error;

function setup(routes: Record<string, Route>, opts: { stepMs?: number } = {}) {
  let clock = 0;
  const calls: string[] = [];
  const fetch = vi.fn<SafeFetch>((url: string, options: SafeFetchOptions) => {
    calls.push(`${options.method ?? 'GET'} ${url}`);
    clock += opts.stepMs ?? 0;
    const route = routes[url];
    if (route instanceof Error) return Promise.reject(route);
    if (route === undefined) return Promise.resolve(response({ url, status: 200 }));
    const res = response({ url, status: route.status ?? 200, headers: route.headers ?? {} });
    return Promise.resolve({ ...res, body: Buffer.from(route.body ?? '') });
  });
  const deps = {
    fetch,
    contactUrl: 'https://example.invalid/contacto',
    now: () => clock,
    scheduler: new HostScheduler({
      intervalMs: 0,
      now: () => clock,
      sleep: () => Promise.resolve(),
    }),
    timeoutSignal: () => new AbortController().signal,
  };
  return { deps, calls };
}

const ROBOTS = (body: string): Route => ({ body, headers: { 'content-type': 'text/plain' } });

describe('collectExtras', () => {
  it('robots, sitemap declarado, favicon declarado y enlaces filtrados', async () => {
    const html = load(`
      <link rel="icon" href="/favicon.png">
      <a href="/a">A</a><a href="/a#seccion">A otra vez</a>
      <a href="/privado/x">Privado</a><a href="mailto:hola@ejemplo.com">Mail</a>
      <a href="tel:+5492800000000">Tel</a><a href="#arriba">Arriba</a>
      <a href="https://otro.com/">Externo</a><a href="javascript:void(0)">JS</a>
      <a href="/roto">Roto</a><a href="/b?token=secreto">B</a><a href="/metodo">M</a>
      <a href="/">Inicio</a>`);
    const { deps, calls } = setup({
      'https://ejemplo.com/robots.txt': ROBOTS(
        'User-agent: *\nDisallow: /privado\nSitemap: https://ejemplo.com/sitemap.xml',
      ),
      'https://ejemplo.com/roto': { status: 404 },
      'https://ejemplo.com/metodo': { status: 405 },
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
      'HEAD https://ejemplo.com/a',
      'HEAD https://ejemplo.com/roto',
      'HEAD https://ejemplo.com/b?token=secreto',
      'HEAD https://ejemplo.com/metodo',
    ]);
    expect(extras.links.found).toBe(5);
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
      { url: 'https://ejemplo.com/metodo', outcome: 'not_verified', status: 405, reason: 'method' },
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
    ]);
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
});
