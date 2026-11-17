import { lookup } from 'node:dns/promises';
import { createSafeFetch, type Resolver, type SafeFetch } from './create-safe-fetch.js';

/** Resolver del sistema: todas las IP, en el orden que devuelve el DNS. */
const systemResolver: Resolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, order: 'verbatim' });
  return results.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
};

/**
 * Única puerta de salida a la red (CLAUDE.md, reglas 1 y 2). Sin opciones de prueba:
 * timeout de 10 s, verificación TLS de Node intacta y solo IP públicas.
 */
export const safeFetch: SafeFetch = createSafeFetch({ resolver: systemResolver });
