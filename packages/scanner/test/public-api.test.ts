import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as factory from '../src/net/create-safe-fetch.js';

// La fábrica de safeFetch acepta opciones de prueba (testEndpoint, ca, timeoutMs).
// Nunca debe salir del paquete, por ningún camino.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('API pública del scanner', () => {
  it('exporta en runtime solo safeFetch, runAudit, normalizeTargetUrl y scoreFindings', async () => {
    const exported = await import('../src/index.js');
    expect(Object.keys(exported).sort()).toEqual([
      'normalizeTargetUrl',
      'runAudit',
      'safeFetch',
      'scoreFindings',
    ]);
  });

  it('ningún valor exportado es la fábrica ni la expone', async () => {
    const exported: Record<string, unknown> = await import('../src/index.js');
    for (const value of Object.values(exported)) {
      expect(value).not.toBe(factory.createSafeFetch);
      expect(Object.values(value as object)).not.toContain(factory.createSafeFetch);
    }
  });

  it('index.ts solo toma tipos del módulo de la fábrica', () => {
    const lines = read('../src/index.ts')
      .split('\n')
      .filter((l) => l.includes('create-safe-fetch'));
    const runtimeImports = read('../src/index.ts').match(
      /^export \{[^}]*\} from '\.\/net\/create-safe-fetch\.js';/gm,
    );
    expect(runtimeImports).toBeNull();
    expect(lines.length).toBeGreaterThan(0);
  });

  it('package.json no expone subrutas (no se puede importar la fábrica por ruta profunda)', () => {
    const pkg = JSON.parse(read('../package.json')) as { exports: Record<string, unknown> };
    expect(Object.keys(pkg.exports)).toEqual(['.']);
  });

  it('el camino de producción no usa opciones de prueba', () => {
    const source = read('../src/net/safe-fetch.ts');
    expect(source).toMatch(/createSafeFetch\(\{ resolver: systemResolver \}\)/);
    for (const option of ['testEndpoint', 'ca:', 'timeoutMs']) {
      expect(source).not.toContain(option);
    }
  });
});
