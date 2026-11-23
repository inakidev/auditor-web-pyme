import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { testDeps } from '../testing/support.js';
import { WEB_CSP } from './serve-web.js';

const SECRET = 'NO-DEBE-SALIR-DE-DIST';
let root = '';
let dist = '';
let apps: ReturnType<typeof buildApp>[] = [];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'auditor-web-'));
  dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(dist, 'assets', 'index-abc123.css'), 'body{}');
  writeFileSync(join(dist, 'favicon.svg'), '<svg/>');
  // Fuera de dist: nunca se tiene que poder leer.
  writeFileSync(join(root, 'secret.txt'), SECRET);
  writeFileSync(join(root, 'package.json'), SECRET);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

function setup(webDist: string | null = dist) {
  const app = buildApp(testDeps(webDist === null ? {} : { webDist }));
  apps.push(app);
  return app;
}

const get = (app: ReturnType<typeof buildApp>, url: string, method: 'GET' | 'HEAD' = 'GET') =>
  app.inject({ method, url });

describe('web compilada', () => {
  it('sirve la portada con no-cache, nosniff y la CSP del documento', async () => {
    const res = await get(setup(), '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe(WEB_CSP);
    expect(res.body).toContain('<div id="root">');
  });

  it('las rutas de la SPA sin extensión devuelven index.html con la misma CSP', async () => {
    for (const url of ['/panel', '/panel/contactos', '/informe/abc?x=1', '/no-existe']) {
      const res = await get(setup(), url);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-security-policy']).toBe(WEB_CSP);
      expect(res.body).toContain('<div id="root">');
    }
  });

  it('los assets con hash llevan cache largo e immutable y su Content-Type', async () => {
    const js = await get(setup(), '/assets/index-abc123.js?v=1');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(js.headers['x-content-type-options']).toBe('nosniff');
    const css = await get(setup(), '/assets/index-abc123.css');
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');
    const svg = await get(setup(), '/favicon.svg');
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    expect(svg.headers['cache-control']).toBe('no-cache');
  });

  it('un asset inexistente da 404 (nunca HTML con 200)', async () => {
    for (const url of ['/assets/no-existe.js', '/robots.txt', '/favicon.ico']) {
      const res = await get(setup(), url);
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('<div id="root">');
    }
  });

  it('/api no cae en el fallback: 404 en JSON', async () => {
    for (const url of ['/api/no-existe', '/api', '/api/']) {
      const res = await get(setup(), url);
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    }
  });

  it('solo GET y HEAD: HEAD responde sin cuerpo, POST da 404', async () => {
    const head = await get(setup(), '/', 'HEAD');
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    const post = await setup().inject({ method: 'POST', url: '/' });
    expect(post.statusCode).toBe(404);
    expect(post.body).not.toContain('<div id="root">');
  });

  it.each([
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2E%2E/%2E%2E/package.json',
    '/assets/..%2f..%2fsecret.txt',
    '/assets%2findex-abc123.js',
    '/assets%2Findex-abc123.js',
    '/..%5csecret.txt',
    '/assets\\..\\..\\secret.txt',
    '/index.html%00.js',
    '/secret.txt%00',
    '/%252e%252e/secret.txt',
    '/%252e%252e%252fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/.%2e/secret.txt',
  ])('no se puede salir de dist: %s', async (url) => {
    const res = await get(setup(), url);
    expect(res.body).not.toContain(SECRET);
    expect(res.statusCode).toBe(404);
  });

  it('una URL mal codificada la corta Fastify con 400, sin llegar a dist', async () => {
    for (const url of ['/%', '/%zz', '/%e0%a4%a']) {
      const res = await get(setup(), url);
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain(SECRET);
    }
  });

  it('sin web compilada (desarrollo con Vite) todo lo que no es API da 404', async () => {
    const res = await get(setup(null), '/');
    expect(res.statusCode).toBe(404);
  });

  it('con una carpeta sin index.html no sirve nada', async () => {
    const res = await get(setup(join(root, 'no-existe')), '/');
    expect(res.statusCode).toBe(404);
  });
});
