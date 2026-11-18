// SEC-01 a SEC-04: HTTPS, redirección, certificado y versión de TLS.
import { defineCheck, formatDate } from '../check.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERMANENT = new Set([301, 308]);
const PROTOCOL_ERROR = /PROTOCOL|VERSION|HANDSHAKE/;

export const sec01 = defineCheck(
  { id: 'SEC-01', category: 'security', severity: 'critical' },
  ({ https }) => {
    if (https.ok && https.response.url.startsWith('https:')) {
      return {
        status: 'pass',
        title: 'Tu sitio funciona con HTTPS',
        recommendation: 'No hace falta hacer nada.',
      };
    }
    if (https.ok) {
      return {
        status: 'fail',
        title: 'La versión segura (HTTPS) redirige a la versión sin cifrar',
        evidence: `HTTPS terminó en ${https.response.url}`,
        recommendation:
          'Configurá el servidor para que HTTPS no redirija a HTTP: así los datos viajan cifrados.',
        effort: 'medium',
      };
    }
    if (https.code === 'TLS_ERROR') {
      return {
        status: 'warn',
        title: 'El sitio responde por HTTPS, pero con un certificado inválido',
        evidence: `Motivo técnico: ${https.detail ?? https.code}`,
        recommendation: 'Revisá el control del certificado: ahí está el problema a resolver.',
      };
    }
    return {
      status: 'fail',
      title: 'Tu sitio no funciona con HTTPS',
      evidence: `No pudimos conectarnos por HTTPS (${https.code})`,
      recommendation:
        "Activá HTTPS con un certificado gratuito (por ejemplo, Let's Encrypt). La mayoría de los hostings lo ofrece con un clic.",
      effort: 'medium',
    };
  },
);

export const sec02 = defineCheck(
  { id: 'SEC-02', category: 'security', severity: 'high' },
  ({ http }) => {
    if (!http.ok) {
      return {
        status: 'na',
        title: 'El sitio no responde por HTTP (puerto 80)',
        evidence: `Motivo técnico: ${http.code}`,
        recommendation:
          'Si querés, habilitá el puerto 80 solo para redirigir a HTTPS: ayuda a quien escribe la dirección sin "https".',
      };
    }
    const { response } = http;
    if (!response.url.startsWith('https:')) {
      return {
        status: 'fail',
        title: 'La versión sin cifrar (HTTP) no redirige a HTTPS',
        evidence: `${response.url} respondió ${String(response.status)} sin redirigir a HTTPS`,
        recommendation:
          'Configurá una redirección permanente (301) de http:// a https:// en el servidor o en el panel del hosting.',
      };
    }
    const statuses = response.redirects.map((r) => r.status);
    if (statuses.every((s) => PERMANENT.has(s))) {
      return {
        status: 'pass',
        title: 'La versión sin cifrar redirige a HTTPS de forma permanente',
        evidence: `Redirecciones: ${statuses.join(' → ')}`,
        recommendation: 'No hace falta hacer nada.',
      };
    }
    return {
      status: 'warn',
      title: 'Redirige a HTTPS, pero con una redirección temporal',
      evidence: `Redirecciones: ${statuses.join(' → ')}`,
      recommendation:
        'Cambiá la redirección a permanente (301 o 308) para que navegadores y buscadores la recuerden.',
    };
  },
);

function certificateProblem(error: string): string {
  if (error === 'CERT_HAS_EXPIRED') return 'El certificado de seguridad está vencido';
  if (error === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return 'El certificado es autofirmado y los navegadores no lo aceptan';
  }
  if (error === 'ERR_TLS_CERT_ALTNAME_INVALID' || error === 'HOSTNAME_MISMATCH') {
    return 'El certificado no corresponde a este dominio';
  }
  if (error.startsWith('UNABLE_TO_')) {
    return 'Al certificado le falta la cadena de confianza (certificados intermedios)';
  }
  if (error === 'CERT_NOT_YET_VALID') return 'El certificado todavía no es válido';
  return 'El certificado de seguridad no es válido';
}

export const sec03 = defineCheck(
  { id: 'SEC-03', category: 'security', severity: 'critical' },
  ({ tls, now }) => {
    if (tls === null || (!tls.valid && PROTOCOL_ERROR.test(tls.error ?? ''))) {
      return {
        status: 'na',
        title: 'No pudimos revisar el certificado',
        recommendation: 'Primero hace falta que el sitio responda por HTTPS.',
      };
    }
    if (!tls.valid) {
      const error = tls.error ?? 'desconocido';
      return {
        status: 'fail',
        title: certificateProblem(error),
        evidence: `Motivo técnico: ${error}`,
        recommendation:
          "Renová o reinstalá el certificado (Let's Encrypt es gratuito y se renueva solo). Si usás un hosting, pedile a soporte que lo revise.",
      };
    }
    const issuer = tls.issuer === null ? '' : `Emitido por ${tls.issuer}. `;
    if (tls.validTo === null) {
      return {
        status: 'pass',
        title: 'El certificado de seguridad es válido',
        evidence: issuer || null,
        recommendation: 'No hace falta hacer nada.',
      };
    }
    const days = Math.floor((Date.parse(tls.validTo) - now.getTime()) / DAY_MS);
    const evidence = `${issuer}Vence el ${formatDate(tls.validTo)}.`;
    if (days < 30) {
      return {
        status: days < 14 ? 'fail' : 'warn',
        severity: 'high',
        title: `El certificado vence en ${String(days)} días`,
        evidence,
        recommendation:
          'Renová el certificado antes del vencimiento o activá la renovación automática.',
      };
    }
    return {
      status: 'pass',
      title: 'El certificado de seguridad es válido',
      evidence,
      recommendation: 'No hace falta hacer nada.',
    };
  },
);

export const sec04 = defineCheck(
  { id: 'SEC-04', category: 'security', severity: 'medium' },
  ({ tls }) => {
    const oldTls = {
      status: 'fail',
      title: 'El servidor usa versiones viejas de TLS',
      recommendation: 'Desactivá TLS 1.0 y 1.1 en el servidor y dejá habilitados TLS 1.2 y 1.3.',
      effort: 'medium',
    } as const;
    if (tls !== null && !tls.valid && PROTOCOL_ERROR.test(tls.error ?? '')) {
      return { ...oldTls, evidence: `Motivo técnico: ${tls.error ?? ''}` };
    }
    if (tls === null || !tls.valid || tls.protocol === null) {
      return {
        status: 'na',
        title: 'No pudimos revisar la versión de TLS',
        recommendation: 'Primero hace falta una conexión HTTPS válida.',
      };
    }
    if (tls.protocol === 'TLSv1.3' || tls.protocol === 'TLSv1.2') {
      return {
        status: 'pass',
        title: `La conexión usa una versión actual de TLS (${tls.protocol})`,
        recommendation: 'No hace falta hacer nada.',
      };
    }
    return { ...oldTls, evidence: `Versión negociada: ${tls.protocol}` };
  },
);
