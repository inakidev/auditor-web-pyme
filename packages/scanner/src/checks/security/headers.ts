// SEC-05, SEC-07, SEC-08 y SEC-09: cabeceras de seguridad.
// La evidencia muestra solo nombres y valores reconocidos, nunca el texto crudo de la cabecera.
import { defineCheck, header, NA_NO_RESPONSE } from '../check.js';

const SIX_MONTHS_S = 15_552_000;

export const sec05 = defineCheck(
  { id: 'SEC-05', category: 'security', severity: 'medium' },
  ({ https }) => {
    if (!https.ok) {
      return {
        status: 'na',
        title: 'No pudimos revisar HSTS',
        recommendation: 'Primero hace falta que el sitio responda por HTTPS.',
      };
    }
    const value = header(https.response.headers, 'strict-transport-security');
    const recommendation =
      'Agregá la cabecera Strict-Transport-Security: max-age=31536000 para que los navegadores usen siempre HTTPS.';
    if (value === undefined) {
      return { status: 'fail', title: 'Falta la cabecera HSTS', recommendation };
    }
    const directives = value.split(';').map((d) => d.trim().toLowerCase());
    const maxAge = directives
      .map((d) => /^max-age\s*=\s*"?(\d+)"?$/.exec(d)?.[1])
      .find((v) => v !== undefined);
    const flags = directives.filter((d) => d === 'includesubdomains' || d === 'preload');
    if (maxAge === undefined) {
      return {
        status: 'fail',
        title: 'La cabecera HSTS no tiene una duración válida',
        recommendation,
      };
    }
    const seconds = Number(maxAge);
    const evidence = `Strict-Transport-Security: max-age=${String(seconds)}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}`;
    const days = Math.floor(seconds / 86_400);
    if (seconds < SIX_MONTHS_S) {
      return {
        status: 'warn',
        title: `HSTS está activo, pero por poco tiempo (${String(days)} días)`,
        evidence,
        recommendation: 'Subí max-age a por lo menos 6 meses (15552000); lo habitual es un año.',
      };
    }
    return {
      status: 'pass',
      title: `HSTS está activo por ${String(days)} días`,
      evidence,
      recommendation: 'No hace falta hacer nada.',
    };
  },
);

export const sec07 = defineCheck(
  { id: 'SEC-07', category: 'security', severity: 'low' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const value = header(primary.headers, 'x-content-type-options');
    if (value?.trim().toLowerCase() === 'nosniff') {
      return {
        status: 'pass',
        title: 'El navegador no adivina el tipo de los archivos (nosniff)',
        evidence: 'X-Content-Type-Options: nosniff',
        recommendation: 'No hace falta hacer nada.',
      };
    }
    return {
      status: 'fail',
      title: 'Falta X-Content-Type-Options: nosniff',
      evidence:
        value === undefined ? 'La cabecera no está' : 'La cabecera tiene un valor no válido',
      recommendation: 'Agregá la cabecera X-Content-Type-Options: nosniff.',
    };
  },
);

export const sec08 = defineCheck(
  { id: 'SEC-08', category: 'security', severity: 'medium' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const xfo = header(primary.headers, 'x-frame-options')?.trim().toUpperCase();
    const csp = header(primary.headers, 'content-security-policy') ?? '';
    const hasFrameAncestors = csp
      .split(';')
      .some((d) => d.trim().toLowerCase().startsWith('frame-ancestors'));
    const pass = {
      status: 'pass',
      title: 'El sitio está protegido contra el clickjacking',
      recommendation: 'No hace falta hacer nada.',
    } as const;
    if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
      return { ...pass, evidence: `X-Frame-Options: ${xfo}` };
    }
    if (hasFrameAncestors) {
      return { ...pass, evidence: 'Content-Security-Policy con frame-ancestors' };
    }
    if (xfo?.startsWith('ALLOW-FROM') === true) {
      return {
        status: 'warn',
        title: 'X-Frame-Options usa ALLOW-FROM, que los navegadores actuales ignoran',
        evidence: 'X-Frame-Options: ALLOW-FROM',
        recommendation:
          "Reemplazalo por la directiva frame-ancestors en tu Content-Security-Policy (por ejemplo, frame-ancestors 'self').",
      };
    }
    return {
      status: 'fail',
      title: 'Otras páginas pueden mostrar tu sitio dentro de un marco (clickjacking)',
      evidence:
        xfo === undefined
          ? 'No hay X-Frame-Options ni frame-ancestors'
          : 'X-Frame-Options con un valor no válido',
      recommendation:
        "Agregá X-Frame-Options: SAMEORIGIN o la directiva frame-ancestors 'self' en tu Content-Security-Policy.",
    };
  },
);

const SAFE_REFERRER = new Set([
  'no-referrer',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'origin',
  'origin-when-cross-origin',
]);
const LEAKY_REFERRER = new Set(['unsafe-url', 'no-referrer-when-downgrade']);

export const sec09 = defineCheck(
  { id: 'SEC-09', category: 'security', severity: 'low' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const recommendation = 'Agregá la cabecera Referrer-Policy: strict-origin-when-cross-origin.';
    const value = header(primary.headers, 'referrer-policy');
    if (value === undefined) {
      return {
        status: 'warn',
        title: 'El sitio no define una política de referencia (Referrer-Policy)',
        evidence: 'La cabecera no está; el navegador usa su valor por defecto',
        recommendation,
      };
    }
    // Con varios valores, el navegador usa el último que reconoce.
    const known = value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => SAFE_REFERRER.has(v) || LEAKY_REFERRER.has(v));
    const effective = known.at(-1);
    if (effective !== undefined && SAFE_REFERRER.has(effective)) {
      return {
        status: 'pass',
        title: 'El sitio limita qué información se comparte al salir hacia otros sitios',
        evidence: `Referrer-Policy: ${effective}`,
        recommendation: 'No hace falta hacer nada.',
      };
    }
    return {
      status: 'warn',
      title:
        effective === undefined
          ? 'La política de referencia tiene un valor no reconocido'
          : 'La política de referencia comparte la dirección completa con otros sitios',
      evidence: effective === undefined ? 'Valor no reconocido' : `Referrer-Policy: ${effective}`,
      recommendation,
    };
  },
);
