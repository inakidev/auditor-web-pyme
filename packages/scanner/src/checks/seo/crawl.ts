// SEO-09 (robots.txt), SEO-10 (sitemap), SEO-12 (enlaces internos rotos) y SEO-15 (favicon).
import { defineCheck, type FindingFields } from '../check.js';

const DONE = 'No hace falta hacer nada.';

const notEvaluated = (what: string, code: string): FindingFields => ({
  status: 'not_evaluated',
  title: `No pudimos revisar ${what}`,
  evidence: `Motivo técnico: ${code}`,
  recommendation: 'Volvé a intentar la revisión más tarde.',
});

export const seo09 = defineCheck(
  { id: 'SEO-09', category: 'seo', severity: 'high' },
  ({ robots }) => {
    if (robots.kind === 'error') return notEvaluated('el archivo robots.txt', robots.code);
    if (robots.kind === 'missing') {
      return {
        status: 'warn',
        title: 'El sitio no tiene archivo robots.txt',
        recommendation:
          'Creá un robots.txt que permita el acceso y declare tu sitemap. Sin él, los buscadores igual entran, pero perdés control.',
      };
    }
    if (robots.robots.blocksAll) {
      return {
        status: 'fail',
        severity: 'critical',
        title: 'El robots.txt les bloquea todo el sitio a los buscadores',
        evidence: 'User-agent: * con Disallow: /',
        recommendation:
          'Quitá "Disallow: /" del robots.txt si querés aparecer en Google. Suele quedar así por error al publicar el sitio.',
      };
    }
    return {
      status: 'pass',
      title: 'El robots.txt permite que los buscadores recorran el sitio',
      recommendation: DONE,
    };
  },
);

export const seo10 = defineCheck(
  { id: 'SEO-10', category: 'seo', severity: 'low' },
  ({ sitemap }) => {
    if (sitemap.kind === 'error') return notEvaluated('el sitemap', sitemap.code);
    if (sitemap.kind === 'missing') {
      return {
        status: 'fail',
        title: 'No encontramos un sitemap',
        recommendation:
          'Publicá un sitemap.xml y declaralo en robots.txt para ayudar a Google a encontrar tus páginas.',
      };
    }
    if (sitemap.kind === 'declared') {
      return {
        status: 'pass',
        title: 'El sitio declara un sitemap en robots.txt',
        evidence: sitemap.otherHost
          ? `Declarado en otro dominio (no lo descargamos): ${sitemap.urls.join(', ')}`
          : `Declarado: ${sitemap.urls.join(', ')}`,
        recommendation: DONE,
      };
    }
    return { status: 'pass', title: 'El sitio tiene sitemap.xml', recommendation: DONE };
  },
);

export const seo12 = defineCheck(
  { id: 'SEO-12', category: 'seo', severity: 'medium' },
  ({ links }) => {
    if (links.found === 0) {
      return {
        status: 'na',
        title: 'La portada no tiene enlaces internos para revisar',
        recommendation: DONE,
      };
    }
    const verified = links.results.filter((r) => r.outcome !== 'not_verified');
    const broken = verified.filter((r) => r.outcome === 'broken');
    const summary = `verificamos ${String(verified.length)} de ${String(links.found)} enlaces internos`;
    if (verified.length === 0) {
      return {
        status: 'not_evaluated',
        title: 'No pudimos verificar los enlaces internos',
        evidence: `Resultado: ${summary}`,
        recommendation: 'Volvé a intentar la revisión más tarde.',
      };
    }
    if (broken.length > 0) {
      return {
        status: 'fail',
        title: `Hay ${String(broken.length)} enlaces internos rotos`,
        evidence: `Resultado: ${summary}. Rotos: ${broken.map((r) => `${r.url} (${String(r.status)})`).join(', ')}`,
        recommendation:
          'Corregí o quitá los enlaces rotos: frustran a tus visitantes y le restan puntos a tu sitio en Google.',
      };
    }
    return {
      status: 'pass',
      title: 'No encontramos enlaces internos rotos',
      evidence: `Resultado: ${summary}`,
      recommendation: DONE,
    };
  },
);

export const seo15 = defineCheck(
  { id: 'SEO-15', category: 'seo', severity: 'info' },
  ({ favicon }) => {
    if (favicon.kind === 'error') return notEvaluated('el ícono del sitio', favicon.code);
    if (favicon.kind === 'missing') {
      return {
        status: 'warn',
        title: 'El sitio no tiene ícono (favicon)',
        recommendation:
          'Agregá un favicon con tu logo: aparece en la pestaña del navegador y en los resultados de Google.',
      };
    }
    return { status: 'pass', title: 'El sitio tiene ícono (favicon)', recommendation: DONE };
  },
);
