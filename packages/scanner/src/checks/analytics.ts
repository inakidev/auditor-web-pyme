// Analítica y medición: ANA-01 a ANA-05. Solo se lee el texto del HTML inicial (atributos src y
// scripts en línea); nunca se ejecuta JavaScript. La evidencia nombra la herramienta, sin IDs.
import type { CheerioAPI } from 'cheerio';
import { defineCheck, type FindingFields } from './check.js';

const DONE = 'No hace falta hacer nada.';

const MEASUREMENT: readonly (readonly [string, RegExp])[] = [
  ['GA4', /googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*['"]config['"]\s*,\s*['"]G-/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|['"]GTM-[A-Z0-9]{4,}['"]/i],
  ['Matomo', /matomo\.js|piwik\.js|_paq\.push/i],
  ['Plausible', /plausible\.io\/js\//i],
];
const UNIVERSAL_ANALYTICS = /\bUA-\d{4,10}-\d{1,4}\b/;
const META_PIXEL = /connect\.facebook\.net\/[\w-]+\/fbevents\.js|fbq\(\s*['"]init['"]/i;
const CMP_SCRIPTS =
  /cookiebot\.com|cookielaw\.org|onetrust|cookieyes\.com|iubenda\.com|complianz|osano\.com|termly\.io|usercentrics|klaro|cookieconsent/i;
const CONSENT_ATTR = /cookie|consent|gdpr/i;

interface Signals {
  readonly measurement: readonly string[];
  readonly universalAnalytics: boolean;
  readonly metaPixel: boolean;
  readonly cookieNotice: boolean;
}

/** Texto donde buscar: src de los scripts y contenido de los scripts en línea. */
function scriptText($: CheerioAPI): string {
  return $('script')
    .toArray()
    .map((el) => `${$(el).attr('src') ?? ''}\n${$(el).text()}`)
    .join('\n');
}

function signalsOf($: CheerioAPI): Signals {
  const scripts = scriptText($);
  const consentElement = $('[id], [class]')
    .toArray()
    .some((el) => CONSENT_ATTR.test(`${$(el).attr('id') ?? ''} ${$(el).attr('class') ?? ''}`));
  return {
    measurement: MEASUREMENT.filter(([, pattern]) => pattern.test(scripts)).map(([name]) => name),
    universalAnalytics: UNIVERSAL_ANALYTICS.test(scripts),
    metaPixel: META_PIXEL.test(scripts),
    cookieNotice: CMP_SCRIPTS.test(scripts) || consentElement,
  };
}

const NOT_EVALUATED: FindingFields = {
  status: 'not_evaluated',
  title: 'No pudimos leer el HTML de la portada',
  recommendation: 'Volvé a intentar la revisión más tarde.',
};

function analyticsCheck(
  id: string,
  severity: 'high' | 'medium' | 'info',
  evaluate: (signals: Signals, $: CheerioAPI) => FindingFields,
) {
  return defineCheck({ id, category: 'analytics', severity }, (ctx) =>
    ctx.html === null ? NOT_EVALUATED : evaluate(signalsOf(ctx.html), ctx.html),
  );
}

export const ana01 = analyticsCheck('ANA-01', 'high', ({ measurement, cookieNotice }) => {
  if (measurement.length > 0) {
    return {
      status: 'pass',
      title: 'El sitio mide sus visitas',
      evidence: `Detectamos: ${measurement.join(', ')}`,
      recommendation: DONE,
    };
  }
  const recommendation =
    'Instalá una herramienta de medición (Google Analytics 4 es gratuita; Matomo y Plausible respetan más la privacidad) para saber cuántas personas te visitan y de dónde vienen.';
  if (cookieNotice) {
    return {
      status: 'warn',
      title: 'No detectamos herramientas de medición en el HTML inicial',
      evidence:
        'Hay un aviso de cookies: la medición podría cargarse después de aceptarlo (verificalo)',
      recommendation,
    };
  }
  return {
    status: 'fail',
    title: 'No detectamos herramientas de medición en el HTML inicial',
    recommendation,
  };
});

export const ana02 = analyticsCheck('ANA-02', 'medium', ({ measurement, universalAnalytics }) => {
  if (universalAnalytics) {
    return {
      status: 'fail',
      title: 'El sitio usa Universal Analytics, que dejó de funcionar',
      evidence: 'Detectamos un código de Universal Analytics (UA-)',
      recommendation: 'Pasá a Google Analytics 4: Universal Analytics ya no registra datos.',
    };
  }
  if (measurement.length === 0) {
    return { status: 'na', title: 'No hay medición para revisar', recommendation: DONE };
  }
  return {
    status: 'pass',
    title: 'El sitio no usa la versión obsoleta de Google Analytics',
    recommendation: DONE,
  };
});

export const ana03 = analyticsCheck('ANA-03', 'info', ({ metaPixel }) =>
  metaPixel
    ? {
        status: 'pass',
        title: 'El sitio tiene el píxel de Meta (Facebook e Instagram)',
        recommendation:
          'Sirve para medir tus campañas en redes. Recordá mencionarlo en tu aviso de privacidad.',
      }
    : {
        status: 'na',
        title: 'No detectamos el píxel de Meta',
        recommendation:
          'Si hacés publicidad en Facebook o Instagram, el píxel te ayuda a medir los resultados.',
      },
);

export const ana04 = analyticsCheck(
  'ANA-04',
  'info',
  ({ measurement, metaPixel, cookieNotice }) => {
    const trackers = [...measurement, ...(metaPixel ? ['Meta Pixel'] : [])];
    if (trackers.length === 0) {
      return {
        status: 'na',
        title: 'No detectamos herramientas que usen cookies de seguimiento',
        recommendation: DONE,
      };
    }
    if (cookieNotice) {
      return { status: 'pass', title: 'Detectamos un aviso de cookies', recommendation: DONE };
    }
    return {
      status: 'warn',
      title: 'Podría faltar el aviso de cookies (verificalo)',
      evidence: `Herramientas detectadas: ${trackers.join(', ')}`,
      recommendation:
        'Si usás herramientas de seguimiento, informalo con un aviso de cookies y en tu política de privacidad.',
    };
  },
);

const CONTACT: readonly (readonly [string, RegExp])[] = [
  ['teléfono', /^tel:/i],
  ['correo', /^mailto:/i],
  ['WhatsApp', /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i],
];

export const ana05 = analyticsCheck('ANA-05', 'info', (_signals, $) => {
  const hrefs = $('a[href]')
    .toArray()
    .map((el) => ($(el).attr('href') ?? '').trim());
  const found = CONTACT.filter(([, pattern]) => hrefs.some((h) => pattern.test(h))).map(
    ([name]) => name,
  );
  if (found.length > 0) {
    return {
      status: 'pass',
      title: 'Tus medios de contacto son enlaces que se pueden tocar y medir',
      evidence: `Enlaces de ${found.join(', ')}`,
      recommendation: DONE,
    };
  }
  return {
    status: 'warn',
    title: 'No encontramos enlaces directos de teléfono, correo o WhatsApp',
    recommendation:
      'Convertí tu teléfono y tu WhatsApp en enlaces (tel: y wa.me): se pueden tocar desde el celular y medir como contactos.',
  };
});
