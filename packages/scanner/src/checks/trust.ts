// Confianza y contacto: TRU-01 a TRU-05. Solo lectura del HTML; la evidencia nombra qué se
// encontró (teléfono, correo, Instagram...), nunca copia los datos.
import type { CheerioAPI } from 'cheerio';
import { defineCheck, type FindingFields } from './check.js';

const DONE = 'No hace falta hacer nada.';
const MAX_TEXT = 200_000;

// Patrones acotados (sin cuantificadores anidados ambiguos) sobre un texto limitado.
const PHONE = /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]\d{4}(?!\d)/;
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,5}/;
const ADDRESS =
  /\b(?:av\.?|avenida|calle|ruta|bv\.?|boulevard|pasaje)\s+[\p{L} .]{2,40}\s\d{1,5}\b/iu;
const WHATSAPP = /^https?:\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i;

/** Texto visible: sin scripts, estilos ni noscript. */
function visibleText($: CheerioAPI): string {
  // cheerio.load siempre arma un documento completo, con <body>.
  const body = $('body').clone();
  body.find('script, style, noscript, template').remove();
  return body.text().replace(/\s+/g, ' ').slice(0, MAX_TEXT);
}

const hrefs = ($: CheerioAPI) =>
  $('a[href]')
    .toArray()
    .map((el) => ($(el).attr('href') ?? '').trim());

function hasContactForm($: CheerioAPI): boolean {
  return $('form')
    .toArray()
    .some((form) => {
      const f = $(form);
      if (f.attr('role') === 'search') return false;
      return (
        f.find('textarea, input[type="email"], input[type="tel"]').length > 0 ||
        f
          .find('input[name]')
          .toArray()
          .some((i) => /mail|tel|phone|mensaje|message|nombre|name/i.test($(i).attr('name') ?? ''))
      );
    });
}

function trustCheck(
  id: string,
  severity: 'high' | 'medium' | 'info',
  evaluate: ($: CheerioAPI) => FindingFields,
) {
  return defineCheck({ id, category: 'trust', severity }, ({ html }) =>
    html === null
      ? {
          status: 'not_evaluated',
          title: 'No pudimos leer el HTML de la portada',
          recommendation: 'Volvé a intentar la revisión más tarde.',
        }
      : evaluate(html),
  );
}

export const tru01 = trustCheck('TRU-01', 'high', ($) => {
  const text = visibleText($);
  const links = hrefs($);
  const found = [
    links.some((h) => /^tel:/i.test(h)) || PHONE.test(text) ? 'teléfono' : null,
    links.some((h) => /^mailto:/i.test(h)) || EMAIL.test(text) ? 'correo' : null,
    links.some((h) => WHATSAPP.test(h)) ? 'WhatsApp' : null,
    hasContactForm($) ? 'formulario' : null,
  ].filter((v) => v !== null);
  if (found.length === 0) {
    return {
      status: 'fail',
      title: 'No encontramos medios de contacto en la portada',
      recommendation:
        'Mostrá en la portada al menos un teléfono, un WhatsApp o un correo: es lo primero que busca quien quiere contratarte.',
    };
  }
  return {
    status: 'pass',
    title: 'La portada muestra medios de contacto',
    evidence: `Encontramos: ${found.join(', ')}`,
    recommendation: DONE,
  };
});

export const tru02 = trustCheck('TRU-02', 'info', ($) =>
  hasContactForm($)
    ? { status: 'pass', title: 'Detectamos un formulario de contacto', recommendation: DONE }
    : {
        status: 'warn',
        title: 'No detectamos un formulario de contacto en la portada',
        recommendation:
          'Un formulario simple (nombre, correo y mensaje) ayuda a recibir consultas fuera de horario.',
      },
);

const PRIVACY = /privacidad|privacy|datos personales|protecci[oó]n de datos/i;

export const tru03 = trustCheck('TRU-03', 'medium', ($) => {
  const found = $('a[href]')
    .toArray()
    .some((el) => PRIVACY.test(`${$(el).text()} ${$(el).attr('href') ?? ''}`));
  return found
    ? { status: 'pass', title: 'El sitio enlaza su política de privacidad', recommendation: DONE }
    : {
        status: 'fail',
        title: 'No encontramos un enlace a la política de privacidad',
        recommendation:
          'Publicá una política de privacidad y enlazala desde el pie de página, sobre todo si tenés formularios o medís visitas (Ley 25.326).',
      };
});

const SOCIAL: readonly (readonly [string, RegExp])[] = [
  ['Instagram', /(^|\.)instagram\.com$/],
  ['Facebook', /(^|\.)(facebook\.com|fb\.com)$/],
  ['LinkedIn', /(^|\.)linkedin\.com$/],
  ['X', /(^|\.)(x\.com|twitter\.com)$/],
  ['TikTok', /(^|\.)tiktok\.com$/],
  ['YouTube', /(^|\.)(youtube\.com|youtu\.be)$/],
];

export const tru04 = trustCheck('TRU-04', 'info', ($) => {
  const hosts = hrefs($)
    .filter((h) => URL.canParse(h))
    .map((h) => new URL(h).hostname.toLowerCase());
  const found = SOCIAL.filter(([, pattern]) => hosts.some((h) => pattern.test(h))).map(
    ([name]) => name,
  );
  return found.length > 0
    ? {
        status: 'pass',
        title: 'El sitio enlaza sus redes sociales',
        evidence: `Redes: ${found.join(', ')}`,
        recommendation: DONE,
      }
    : {
        status: 'warn',
        title: 'No encontramos enlaces a redes sociales',
        recommendation:
          'Si tenés redes activas, enlazalas: dan confianza y muestran que el negocio está vigente.',
      };
});

export const tru05 = trustCheck('TRU-05', 'info', ($) => {
  const text = visibleText($);
  const found = [
    $('address').length > 0 ||
    ADDRESS.test(text) ||
    /PostalAddress/.test($('script[type="application/ld+json"]').text())
      ? 'dirección'
      : null,
    PHONE.test(text) ? 'teléfono' : null,
  ].filter((v) => v !== null);
  return found.length > 0
    ? {
        status: 'pass',
        title: 'Detectamos datos del negocio en la portada (verificalo)',
        evidence: `Encontramos: ${found.join(', ')}`,
        recommendation: DONE,
      }
    : {
        status: 'warn',
        title: 'No detectamos dirección ni teléfono visibles (verificalo)',
        recommendation:
          'Mostrá la dirección y el teléfono del negocio, por ejemplo en el pie de página: dan confianza.',
      };
});
