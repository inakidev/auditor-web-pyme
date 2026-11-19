// SEC-06 (CSP), SEC-10 (Permissions-Policy), SEC-11 (cookies) y SEC-12 (versiones expuestas).
// La evidencia muestra nombres y atributos reconocidos, nunca valores crudos.
import { defineCheck, header, NA_NO_RESPONSE } from '../check.js';

const DONE = 'No hace falta hacer nada.';

export const sec06 = defineCheck(
  { id: 'SEC-06', category: 'security', severity: 'medium' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const csp = header(primary.headers, 'content-security-policy');
    if (csp === undefined) {
      return {
        status: 'fail',
        title: 'El sitio no tiene una política de seguridad de contenido (CSP)',
        recommendation:
          "Agregá una cabecera Content-Security-Policy que limite de dónde se cargan scripts (por ejemplo, default-src 'self'). Probala primero en modo Report-Only.",
        effort: 'medium',
      };
    }
    const directives = new Map(
      csp
        .split(';')
        .map((d) => d.trim().toLowerCase().split(/\s+/))
        .filter((parts) => parts[0] !== undefined && parts[0] !== '')
        .map((parts) => [parts[0] ?? '', parts.slice(1)]),
    );
    const scriptSources = directives.get('script-src') ?? directives.get('default-src');
    const observations: string[] = [];
    if (scriptSources === undefined) observations.push('sin default-src ni script-src');
    if (scriptSources?.includes("'unsafe-inline'") === true) observations.push("'unsafe-inline'");
    if (scriptSources?.includes("'unsafe-eval'") === true) observations.push("'unsafe-eval'");
    if (scriptSources?.includes('*') === true) observations.push('comodín *');
    const names = `Directivas: ${[...directives.keys()].join(', ')}`;
    if (observations.length > 0) {
      return {
        status: 'warn',
        title: 'La política de seguridad de contenido (CSP) es permisiva',
        evidence: `${names}. Observaciones: ${observations.join(', ')}`,
        recommendation:
          "Restringí script-src: evitá 'unsafe-inline', 'unsafe-eval' y el comodín *, y definí default-src.",
        effort: 'medium',
      };
    }
    return {
      status: 'pass',
      title: 'El sitio tiene una política de seguridad de contenido (CSP)',
      evidence: names,
      recommendation: DONE,
    };
  },
);

export const sec10 = defineCheck(
  { id: 'SEC-10', category: 'security', severity: 'info' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const policy = header(primary.headers, 'permissions-policy');
    if (policy === undefined) {
      return {
        status: 'warn',
        title: 'El sitio no define una política de permisos (Permissions-Policy)',
        recommendation:
          'Podés agregar Permissions-Policy para desactivar lo que no usás, por ejemplo camera=(), microphone=(), geolocation=().',
      };
    }
    const features = policy.split(',').filter((p) => p.includes('=')).length;
    return {
      status: 'pass',
      title: 'El sitio define una política de permisos',
      evidence: `Permissions-Policy con ${String(features)} permisos configurados`,
      recommendation: DONE,
    };
  },
);

/** Nombre de cookie seguro para mostrar: sin el valor y acotado. */
const cookieName = (raw: string) =>
  (raw.split('=')[0] ?? '')
    .trim()
    .replace(/[^\w.-]/g, '')
    .slice(0, 40);

export const sec11 = defineCheck(
  { id: 'SEC-11', category: 'security', severity: 'medium' },
  ({ primary }) => {
    if (primary === null) return NA_NO_RESPONSE;
    const raw = primary.headers['set-cookie'];
    // Node siempre entrega set-cookie como lista.
    const cookies = raw ?? [];
    if (cookies.length === 0) {
      return { status: 'na', title: 'La portada no crea cookies', recommendation: DONE };
    }
    const https = primary.url.startsWith('https:');
    const parsed = cookies.map((cookie) => {
      const attrs = cookie
        .split(';')
        .slice(1)
        .map((a) => a.trim().toLowerCase());
      const sameSite = attrs.find((a) => a.startsWith('samesite='))?.split('=')[1];
      return {
        name: cookieName(cookie),
        secure: attrs.includes('secure'),
        httpOnly: attrs.includes('httponly'),
        sameSite:
          sameSite === undefined ? null : sameSite.charAt(0).toUpperCase() + sameSite.slice(1),
      };
    });
    const evidence = parsed
      .slice(0, 5)
      .map((c) => {
        const flags = [
          c.secure ? 'Secure' : null,
          c.httpOnly ? 'HttpOnly' : null,
          c.sameSite === null ? null : `SameSite=${c.sameSite}`,
        ]
          .filter((f) => f !== null)
          .join(', ');
        return `${c.name}: ${flags === '' ? 'sin atributos de seguridad' : flags}`;
      })
      .join('; ');
    if (https && parsed.some((c) => !c.secure)) {
      return {
        status: 'fail',
        title: 'Hay cookies sin el atributo Secure',
        evidence,
        recommendation:
          'Marcá las cookies con Secure para que solo viajen cifradas, y sumá HttpOnly y SameSite=Lax cuando corresponda.',
      };
    }
    if (parsed.some((c) => c.sameSite === null || !c.httpOnly)) {
      return {
        status: 'warn',
        title: 'Hay cookies sin SameSite o sin HttpOnly',
        evidence,
        recommendation:
          'Agregá SameSite=Lax a las cookies y HttpOnly a las que no necesita leer JavaScript (por ejemplo, las de sesión).',
      };
    }
    return {
      status: 'pass',
      title: 'Las cookies tienen los atributos de seguridad',
      evidence,
      recommendation: DONE,
    };
  },
);

const HAS_VERSION = /\d+\.\d+/;
/** Nombre del producto sin números de versión. */
const product = (value: string) =>
  value
    .replace(/[^A-Za-z .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);

export const sec12 = defineCheck(
  { id: 'SEC-12', category: 'security', severity: 'low' },
  ({ primary, html }) => {
    if (html === null || primary === null) {
      return {
        status: 'not_evaluated',
        title: 'No pudimos revisar si el sitio muestra versiones de software',
        recommendation: 'Volvé a intentar la revisión más tarde.',
      };
    }
    const exposed: string[] = [];
    const server = header(primary.headers, 'server');
    if (server !== undefined && HAS_VERSION.test(server))
      exposed.push(`Server: ${product(server)}`);
    const poweredBy = header(primary.headers, 'x-powered-by');
    if (poweredBy !== undefined) exposed.push(`X-Powered-By: ${product(poweredBy)}`);
    const generator = html('meta[name="generator"]').first().attr('content');
    if (generator !== undefined && HAS_VERSION.test(generator))
      exposed.push(`generador: ${product(generator)}`);
    if (exposed.length > 0) {
      return {
        status: 'fail',
        title: 'El sitio muestra qué software y qué versión usa',
        evidence: `${exposed.join('; ')} (con número de versión)`,
        recommendation:
          'Ocultá las versiones en las cabeceras Server y X-Powered-By y en la etiqueta generator: les facilitan el trabajo a los atacantes.',
      };
    }
    return {
      status: 'pass',
      title: 'El sitio no muestra versiones de su software',
      recommendation: DONE,
    };
  },
);
