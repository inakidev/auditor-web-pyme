import { describe, expect, it } from 'vitest';

describe('API pública del scanner', () => {
  it('index.ts exporta únicamente safeFetch (la fábrica con opciones de prueba no sale del paquete)', async () => {
    const exported = await import('../src/index.js');
    expect(Object.keys(exported)).toEqual(['safeFetch']);
  });
});
