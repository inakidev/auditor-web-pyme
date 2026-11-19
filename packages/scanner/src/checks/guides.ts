// Guías para cada recomendación (RF-19). Constantes del código: nunca salen del sitio auditado.
// Se verifican a mano con `pnpm check:guides` (usa safeFetch).

export const GUIDE_HOSTS: ReadonlySet<string> = new Set([
  'developer.mozilla.org',
  'developers.google.com',
  'support.google.com',
  'letsencrypt.org',
  'web.dev',
  'ogp.me',
  'securitytxt.org',
  'www.argentina.gob.ar',
]);

const MDN = 'https://developer.mozilla.org/es/docs/Web';
/** Páginas de MDN que todavía no tienen traducción al español. */
const MDN_EN = 'https://developer.mozilla.org/en-US/docs/Web';
const GOOGLE = 'https://developers.google.com/search/docs';

export const GUIDES: Readonly<Record<string, string>> = {
  'SEC-01': 'https://letsencrypt.org/es/getting-started/',
  'SEC-02': `${MDN_EN}/HTTP/Guides/Redirections`,
  'SEC-03': 'https://letsencrypt.org/es/getting-started/',
  'SEC-05': `${MDN}/HTTP/Headers/Strict-Transport-Security`,
  'SEC-06': `${MDN}/HTTP/CSP`,
  'SEC-07': `${MDN}/HTTP/Headers/X-Content-Type-Options`,
  'SEC-08': `${MDN}/HTTP/Headers/X-Frame-Options`,
  'SEC-09': `${MDN}/HTTP/Headers/Referrer-Policy`,
  'SEC-11': `${MDN}/HTTP/Cookies`,
  'SEC-13': `${MDN_EN}/Security/Defenses/Mixed_content`,
  'SEC-15': `${MDN_EN}/Security/Defenses/Subresource_Integrity`,
  'SEC-16': 'https://securitytxt.org/',
  'SEO-01': `${GOOGLE}/appearance/title-link?hl=es`,
  'SEO-02': `${GOOGLE}/appearance/snippet?hl=es`,
  'SEO-04': `${GOOGLE}/crawling-indexing/consolidate-duplicate-urls?hl=es`,
  'SEO-05': `${MDN}/HTML/Global_attributes/lang`,
  'SEO-06': `${MDN}/HTML/Viewport_meta_tag`,
  'SEO-07': 'https://ogp.me/',
  'SEO-08': `${GOOGLE}/appearance/google-images?hl=es`,
  'SEO-09': `${GOOGLE}/crawling-indexing/robots/intro?hl=es`,
  'SEO-10': `${GOOGLE}/crawling-indexing/sitemaps/overview?hl=es`,
  'SEO-11': `${GOOGLE}/crawling-indexing/block-indexing?hl=es`,
  'SEO-13': `${GOOGLE}/specialty/international/localized-versions?hl=es`,
  'SEO-14': `${GOOGLE}/appearance/structured-data/intro-structured-data?hl=es`,
  'SEO-15': `${GOOGLE}/appearance/favicon-in-search?hl=es`,
  'PER-01': `${MDN_EN}/HTTP/Guides/Compression`,
  'PER-02': 'https://web.dev/articles/ttfb?hl=es',
  'ANA-01': 'https://support.google.com/analytics/answer/9304153?hl=es',
  'ANA-02': 'https://support.google.com/analytics/answer/11583528?hl=es',
  'TRU-03': 'https://www.argentina.gob.ar/aaip/datospersonales',
};
