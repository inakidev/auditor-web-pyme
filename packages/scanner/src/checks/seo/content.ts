// SEO de la portada: SEO-01 a SEO-08, SEO-11, SEO-13 y SEO-14. Solo lectura del HTML con cheerio.
import type { CheerioAPI } from 'cheerio';
import type { AuditContext } from '../../audit/context.js';
import { displayUrl } from '../../crawl/collect.js';
import { defineCheck, header, type FindingFields } from '../check.js';
import { detectLanguage } from './language.js';

const NOT_EVALUATED: FindingFields = {
  status: 'not_evaluated',
  title: 'No pudimos leer el HTML de la portada',
  recommendation: 'Volvé a intentar la revisión más tarde.',
};

const DONE = 'No hace falta hacer nada.';

/** Define un check que necesita el HTML; sin HTML queda como no evaluado. */
function htmlCheck(
  id: string,
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
  evaluate: ($: CheerioAPI, ctx: AuditContext) => FindingFields,
) {
  return defineCheck({ id, category: 'seo', severity }, (ctx) =>
    ctx.html === null ? NOT_EVALUATED : evaluate(ctx.html, ctx),
  );
}

const text = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const meta = ($: CheerioAPI, attr: 'name' | 'property', key: string) =>
  text(
    $(`meta[${attr}]`)
      .filter((_, el) => ($(el).attr(attr) ?? '').toLowerCase() === key)
      .first()
      .attr('content'),
  );

export const seo01 = htmlCheck('SEO-01', 'high', ($) => {
  const title = text($('head > title').first().text() || $('title').first().text());
  const recommendation =
    'Escribí un título de entre 10 y 60 caracteres que diga qué hacés y dónde (por ejemplo, "Clínica del Sur: turnos en Trelew").';
  if (title === '') return { status: 'fail', title: 'La página no tiene título', recommendation };
  const evidence = `Título (${String(title.length)} caracteres): ${title}`;
  if (title.length < 10 || title.length > 60) {
    return {
      status: 'warn',
      title: 'El título es demasiado corto o demasiado largo',
      evidence,
      recommendation,
    };
  }
  return {
    status: 'pass',
    title: 'La página tiene un buen título',
    evidence,
    recommendation: DONE,
  };
});

export const seo02 = htmlCheck('SEO-02', 'medium', ($) => {
  const description = meta($, 'name', 'description');
  const recommendation =
    'Agregá una meta descripción de entre 50 y 160 caracteres: es el texto que aparece debajo del título en Google.';
  if (description === '')
    return { status: 'fail', title: 'Falta la meta descripción', recommendation };
  const evidence = `Descripción (${String(description.length)} caracteres): ${description}`;
  if (description.length < 50 || description.length > 160) {
    return {
      status: 'warn',
      title: 'La meta descripción es demasiado corta o demasiado larga',
      evidence,
      recommendation,
    };
  }
  return {
    status: 'pass',
    title: 'La página tiene una buena meta descripción',
    evidence,
    recommendation: DONE,
  };
});

export const seo03 = htmlCheck('SEO-03', 'medium', ($) => {
  const count = $('h1').length;
  const recommendation = 'Usá un solo título principal (H1) que resuma de qué trata la página.';
  if (count === 0)
    return { status: 'fail', title: 'La página no tiene título principal (H1)', recommendation };
  if (count > 1) {
    return {
      status: 'warn',
      title: `La página tiene ${String(count)} títulos principales (H1)`,
      recommendation,
    };
  }
  return {
    status: 'pass',
    title: 'La página tiene un solo título principal (H1)',
    evidence: text($('h1').first().text()),
    recommendation: DONE,
  };
});

export const seo04 = htmlCheck('SEO-04', 'low', ($, ctx) => {
  const href = $('link[rel="canonical"]').first().attr('href');
  const recommendation = 'Agregá <link rel="canonical"> con la dirección principal de cada página.';
  if (href === undefined || ctx.primary === null || !URL.canParse(href, ctx.primary.url)) {
    return { status: 'fail', title: 'Falta la dirección canónica', recommendation };
  }
  const canonical = new URL(href, ctx.primary.url);
  const evidence = `Canónica: ${displayUrl(canonical)}`;
  if (canonical.host !== new URL(ctx.primary.url).host) {
    return {
      status: 'warn',
      title: 'La dirección canónica apunta a otro dominio',
      evidence,
      recommendation:
        'Revisá que la canónica apunte a tu propio dominio; si no, Google podría ignorar esta página.',
    };
  }
  return {
    status: 'pass',
    title: 'La página declara su dirección canónica',
    evidence,
    recommendation: DONE,
  };
});

export const seo05 = htmlCheck('SEO-05', 'medium', ($) => {
  const lang = text($('html').attr('lang')).toLowerCase();
  if (lang === '') {
    return {
      status: 'fail',
      title: 'Falta el idioma del documento (atributo lang)',
      recommendation: 'Agregá el idioma en la etiqueta <html>, por ejemplo <html lang="es-AR">.',
    };
  }
  const declared = lang.split('-')[0] ?? lang;
  const title = text($('title').first().text());
  const description = meta($, 'name', 'description');
  const titleLang = detectLanguage(title);
  const descriptionLang = detectLanguage(description);
  const contentLang = detectLanguage(`${title} ${description}`);
  const evidence = `Idioma declarado: ${lang}`;
  if (titleLang !== null && descriptionLang !== null && titleLang !== descriptionLang) {
    return {
      status: 'warn',
      title: 'El título y la descripción parecen estar en idiomas distintos (verificalo)',
      evidence,
      recommendation:
        'Si es un error, escribí el título y la descripción en el mismo idioma que la página.',
    };
  }
  if (contentLang !== null && contentLang !== declared) {
    return {
      status: 'warn',
      title: 'El idioma declarado podría no coincidir con el del contenido (verificalo)',
      evidence,
      recommendation: `Revisá el atributo lang: el texto parece estar en "${contentLang}".`,
    };
  }
  return { status: 'pass', title: 'La página declara su idioma', evidence, recommendation: DONE };
});

export const seo06 = htmlCheck('SEO-06', 'high', ($) => {
  const viewport = meta($, 'name', 'viewport');
  const recommendation =
    'Agregá <meta name="viewport" content="width=device-width, initial-scale=1"> para que se vea bien en celulares.';
  if (viewport === '')
    return {
      status: 'fail',
      title: 'La página no está preparada para celulares (falta viewport)',
      recommendation,
    };
  if (!/width\s*=\s*device-width/i.test(viewport)) {
    return {
      status: 'warn',
      title: 'La configuración para celulares (viewport) está incompleta',
      recommendation,
    };
  }
  return { status: 'pass', title: 'La página está preparada para celulares', recommendation: DONE };
});

export const seo07 = htmlCheck('SEO-07', 'medium', ($) => {
  const present = ['og:title', 'og:description', 'og:image'].filter(
    (k) => meta($, 'property', k) !== '',
  );
  const twitter = meta($, 'name', 'twitter:card') !== '';
  const recommendation =
    'Agregá og:title, og:description y og:image para que tu sitio se vea bien al compartirlo en WhatsApp y redes.';
  const evidence = `Encontradas: ${[...present, ...(twitter ? ['twitter:card'] : [])].join(', ') || 'ninguna'}`;
  if (present.length === 0) {
    return {
      status: 'fail',
      title: 'Faltan las etiquetas para compartir en redes',
      evidence,
      recommendation,
    };
  }
  if (present.length < 3) {
    return {
      status: 'warn',
      title: 'Las etiquetas para compartir en redes están incompletas',
      evidence,
      recommendation,
    };
  }
  return {
    status: 'pass',
    title: 'Tu sitio se ve bien al compartirlo en redes',
    evidence,
    recommendation: DONE,
  };
});

export const seo08 = htmlCheck('SEO-08', 'medium', ($) => {
  const images = $('img').toArray();
  if (images.length === 0) {
    return { status: 'na', title: 'La portada no tiene imágenes', recommendation: DONE };
  }
  const withAlt = images.filter((el) => $(el).attr('alt') !== undefined).length;
  const percent = Math.round((withAlt / images.length) * 100);
  const evidence = `${String(withAlt)} de ${String(images.length)} imágenes tienen texto alternativo (${String(percent)} %)`;
  const recommendation =
    'Agregá un texto alternativo (alt) que describa cada imagen: ayuda a personas con lectores de pantalla y a Google.';
  if (percent >= 90)
    return {
      status: 'pass',
      title: 'Las imágenes tienen texto alternativo',
      evidence,
      recommendation: DONE,
    };
  return {
    status: percent >= 50 ? 'warn' : 'fail',
    title: 'Hay imágenes sin texto alternativo',
    evidence,
    recommendation,
  };
});

export const seo11 = htmlCheck('SEO-11', 'critical', ($, ctx) => {
  const metaRobots = ['robots', 'googlebot'].map((k) => meta($, 'name', k).toLowerCase()).join(' ');
  const headerRobots = (
    ctx.primary === null ? '' : (header(ctx.primary.headers, 'x-robots-tag') ?? '')
  ).toLowerCase();
  const inMeta = metaRobots.includes('noindex');
  const inHeader = headerRobots.includes('noindex');
  if (inMeta || inHeader) {
    return {
      status: 'fail',
      title: 'La página les pide a los buscadores que no la muestren (noindex)',
      evidence: inMeta ? 'meta robots con noindex' : 'Cabecera X-Robots-Tag con noindex',
      recommendation:
        'Si querés aparecer en Google, quitá "noindex". Suele quedar activado por error después de terminar el sitio.',
    };
  }
  return {
    status: 'pass',
    title: 'La página permite aparecer en los buscadores',
    recommendation: DONE,
  };
});

const LANG_CODE = /^([a-z]{2,3})(-[a-z0-9]{2,8})*$|^x-default$/i;

export const seo13 = htmlCheck('SEO-13', 'low', ($) => {
  const alternates = $('link[rel="alternate"][hreflang]').toArray();
  if (alternates.length === 0) {
    return {
      status: 'na',
      title: 'El sitio no declara versiones en otros idiomas',
      recommendation: DONE,
    };
  }
  const invalid = alternates.filter(
    (el) => !LANG_CODE.test($(el).attr('hreflang') ?? '') || !$(el).attr('href'),
  );
  if (invalid.length > 0) {
    return {
      status: 'warn',
      title: 'Algunas versiones en otros idiomas (hreflang) están mal declaradas',
      evidence: `${String(invalid.length)} de ${String(alternates.length)} con código de idioma o dirección inválidos`,
      recommendation:
        'Usá códigos de idioma válidos (por ejemplo, es-AR o en) y direcciones completas.',
    };
  }
  return {
    status: 'pass',
    title: 'Las versiones en otros idiomas están bien declaradas',
    recommendation: DONE,
  };
});

export const seo14 = htmlCheck('SEO-14', 'info', ($) => {
  const blocks = $('script[type="application/ld+json"]').toArray();
  const recommendation =
    'Podés agregar datos estructurados (JSON-LD, por ejemplo LocalBusiness) para que Google muestre dirección y horarios.';
  if (blocks.length === 0)
    return { status: 'warn', title: 'La página no tiene datos estructurados', recommendation };
  const valid = blocks.filter((el) => {
    try {
      JSON.parse($(el).text());
      return true;
    } catch {
      return false;
    }
  }).length;
  if (valid < blocks.length) {
    return {
      status: 'warn',
      title: 'Hay datos estructurados con errores',
      evidence: `${String(blocks.length - valid)} de ${String(blocks.length)} bloques no son JSON válido`,
      recommendation:
        'Revisá los datos estructurados con la herramienta de prueba de resultados enriquecidos de Google.',
    };
  }
  return { status: 'pass', title: 'La página tiene datos estructurados', recommendation: DONE };
});
