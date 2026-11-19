// SEC-13 (contenido mixto), SEC-14 (formularios inseguros), SEC-15 (SRI) y SEC-16 (security.txt).
import type { CheerioAPI } from 'cheerio';
import type { AuditContext } from '../../audit/context.js';
import { displayUrl } from '../../crawl/collect.js';
import type { SafeFetchResponse } from '../../net/create-safe-fetch.js';
import { defineCheck, type FindingFields } from '../check.js';

const DONE = 'No hace falta hacer nada.';

function pageCheck(
  id: string,
  severity: 'high' | 'medium' | 'info',
  evaluate: ($: CheerioAPI, primary: SafeFetchResponse) => FindingFields,
) {
  return defineCheck({ id, category: 'security', severity }, ({ html, primary }: AuditContext) =>
    html === null || primary === null
      ? {
          status: 'not_evaluated',
          title: 'No pudimos leer el HTML de la portada',
          recommendation: 'Volvé a intentar la revisión más tarde.',
        }
      : evaluate(html, primary),
  );
}

const RESOURCE_SELECTOR =
  'img[src], script[src], iframe[src], audio[src], video[src], source[src], embed[src], link[rel~="stylesheet"][href]';

export const sec13 = pageCheck('SEC-13', 'medium', ($, primary) => {
  if (!primary.url.startsWith('https:')) {
    return { status: 'na', title: 'La portada no se sirve por HTTPS', recommendation: DONE };
  }
  const insecure = $(RESOURCE_SELECTOR)
    .toArray()
    .map((el) => ($(el).attr('src') ?? $(el).attr('href') ?? '').trim())
    .filter((url) => /^http:\/\//i.test(url) && URL.canParse(url));
  if (insecure.length === 0) {
    return {
      status: 'pass',
      title: 'La página no carga recursos sin cifrar',
      recommendation: DONE,
    };
  }
  return {
    status: 'fail',
    title: 'La página segura carga recursos sin cifrar (contenido mixto)',
    evidence: `${String(insecure.length)} recursos con http://, por ejemplo: ${insecure.slice(0, 3).map(displayUrl).join(', ')}`,
    recommendation:
      'Cambiá esas direcciones a https://. Los navegadores bloquean o marcan como inseguro el contenido mixto.',
  };
});

export const sec14 = pageCheck('SEC-14', 'high', ($, primary) => {
  const forms = $('form').toArray();
  if (forms.length === 0) {
    return { status: 'na', title: 'La portada no tiene formularios', recommendation: DONE };
  }
  const pageIsHttps = primary.url.startsWith('https:');
  const toHttp = forms.filter((form) => {
    const action = ($(form).attr('action') ?? '').trim();
    return (
      action !== '' &&
      URL.canParse(action, primary.url) &&
      new URL(action, primary.url).protocol === 'http:'
    );
  }).length;
  const passwordWithoutHttps = !pageIsHttps && $('input[type="password"]').length > 0;
  if (toHttp > 0 || passwordWithoutHttps) {
    return {
      status: 'fail',
      title: 'Hay formularios que envían datos sin cifrar',
      evidence: passwordWithoutHttps
        ? 'Campo de contraseña en una página sin HTTPS'
        : `${String(toHttp)} formularios envían a una dirección http://`,
      recommendation:
        'Hacé que todos los formularios envíen a direcciones https:// y serví la página por HTTPS.',
    };
  }
  return {
    status: 'pass',
    title: 'Los formularios envían los datos cifrados',
    recommendation: DONE,
  };
});

export const sec15 = pageCheck('SEC-15', 'info', ($, primary) => {
  const host = new URL(primary.url).host;
  const external = $('script[src]')
    .toArray()
    .filter((el) => {
      const src = $(el).attr('src') ?? '';
      return URL.canParse(src, primary.url) && new URL(src, primary.url).host !== host;
    });
  if (external.length === 0) {
    return {
      status: 'na',
      title: 'La portada no carga scripts de otros sitios',
      recommendation: DONE,
    };
  }
  const withoutIntegrity = external.filter((el) => $(el).attr('integrity') === undefined);
  if (withoutIntegrity.length === 0) {
    return {
      status: 'pass',
      title: 'Los scripts de otros sitios se verifican con integrity',
      recommendation: DONE,
    };
  }
  const hosts = [
    ...new Set(withoutIntegrity.map((el) => new URL($(el).attr('src') ?? '', primary.url).host)),
  ];
  return {
    status: 'warn',
    title: 'Hay scripts de otros sitios sin verificación de integridad',
    evidence: `${String(withoutIntegrity.length)} scripts de: ${hosts.slice(0, 5).join(', ')}`,
    recommendation:
      'Si cargás bibliotecas desde un CDN con versión fija, agregales el atributo integrity (Subresource Integrity).',
  };
});

export const sec16 = defineCheck(
  { id: 'SEC-16', category: 'security', severity: 'info' },
  ({ securityTxt }) => {
    if (securityTxt.kind === 'error') {
      return {
        status: 'not_evaluated',
        title: 'No pudimos revisar el archivo security.txt',
        evidence: `Motivo técnico: ${securityTxt.code}`,
        recommendation: 'Volvé a intentar la revisión más tarde.',
      };
    }
    const recommendation =
      'Publicá /.well-known/security.txt con una línea Contact: para que puedan avisarte si encuentran un problema de seguridad.';
    if (securityTxt.kind === 'missing') {
      return { status: 'warn', title: 'El sitio no tiene archivo security.txt', recommendation };
    }
    if (!securityTxt.hasContact) {
      return {
        status: 'warn',
        title: 'El archivo security.txt no tiene un contacto',
        recommendation,
      };
    }
    return {
      status: 'pass',
      title: 'El sitio publica un contacto de seguridad (security.txt)',
      recommendation: DONE,
    };
  },
);
