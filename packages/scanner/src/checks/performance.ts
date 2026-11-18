// Rendimiento liviano: PER-01 a PER-03, sobre la portada pedida por HTTPS con gzip, br.
import type { SafeFetchResponse } from '../net/create-safe-fetch.js';
import type { AuditContext } from '../audit/context.js';
import { defineCheck, type FindingFields } from './check.js';

const DONE = 'No hace falta hacer nada.';
const MIN_COMPRESSIBLE_BYTES = 1024;
const COMPRESSED = new Set(['gzip', 'x-gzip', 'br', 'deflate']);

function perfCheck(
  id: string,
  severity: 'medium' | 'low' | 'info',
  evaluate: (res: SafeFetchResponse, ctx: AuditContext) => FindingFields,
) {
  return defineCheck({ id, category: 'performance', severity }, (ctx) =>
    ctx.https.ok
      ? evaluate(ctx.https.response, ctx)
      : {
          status: 'not_evaluated',
          title: 'No pudimos medir el rendimiento',
          recommendation: 'Primero hace falta que el sitio responda por HTTPS.',
        },
  );
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;

export const per01 = perfCheck('PER-01', 'low', (res) => {
  if (res.body.length < MIN_COMPRESSIBLE_BYTES) {
    return {
      status: 'na',
      title: 'La página es tan liviana que no hace falta comprimirla',
      recommendation: DONE,
    };
  }
  if (res.contentEncoding !== null && COMPRESSED.has(res.contentEncoding)) {
    return {
      status: 'pass',
      title: 'El servidor comprime las páginas',
      evidence: `Content-Encoding: ${res.contentEncoding}`,
      recommendation: DONE,
    };
  }
  return {
    status: 'fail',
    title: 'El servidor no comprime las páginas',
    recommendation:
      'Activá la compresión gzip o brotli en el servidor o en el panel del hosting: la página carga más rápido.',
  };
});

export const per02 = perfCheck('PER-02', 'medium', (res) => {
  const ms = Math.round(res.timings.ttfbMs);
  const evidence = `Primera respuesta en ${String(ms)} ms, medido desde nuestro servidor (puede variar según dónde esté tu visitante)`;
  if (ms < 800)
    return { status: 'pass', title: 'El sitio responde rápido', evidence, recommendation: DONE };
  return {
    status: ms < 1800 ? 'warn' : 'fail',
    title: 'El sitio tarda en empezar a responder',
    evidence,
    recommendation:
      'Consultá con tu hosting: un plan mejor, una caché o una CDN suelen bajar mucho el tiempo de respuesta.',
    effort: 'medium',
  };
});

const MAX_HTML_BYTES = 500 * 1024;
const MAX_SCRIPTS = 30;

export const per03 = perfCheck('PER-03', 'info', (res, ctx) => {
  const scripts = ctx.html === null ? 0 : ctx.html('script').length;
  const evidence = `HTML de ${kb(res.body.length)} (${kb(res.rawBytes)} transferidos) y ${String(scripts)} scripts`;
  if (res.body.length > MAX_HTML_BYTES || scripts > MAX_SCRIPTS) {
    return {
      status: 'warn',
      title: 'La portada es pesada o tiene muchos scripts',
      evidence,
      recommendation:
        'Revisá si podés quitar scripts o complementos que no uses: cada uno suma tiempo de carga.',
      effort: 'medium',
    };
  }
  return {
    status: 'pass',
    title: 'El peso de la portada es razonable',
    evidence,
    recommendation: DONE,
  };
});
