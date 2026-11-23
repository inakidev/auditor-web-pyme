import type { FastifyReply } from 'fastify';
import type { ApiError } from '@auditor/shared';

// Códigos de error -> mensajes en español rioplatense, sin tecnicismos.
const MESSAGES = {
  INVALID_INPUT: 'Ingresá la dirección de un sitio, por ejemplo ejemplo.com.',
  INVALID_URL: 'La dirección no es válida. Probá con algo como ejemplo.com.',
  BLOCKED_SCHEME: 'Solo podemos revisar sitios web (direcciones que empiezan con http o https).',
  BLOCKED_PORT: 'Solo podemos revisar sitios en los puertos web habituales (80 y 443).',
  CREDENTIALS_IN_URL: 'Sacá el usuario y la contraseña de la dirección: no hacen falta.',
  BLOCKED_HOST: 'Esa dirección no es un sitio público. Ingresá un dominio como ejemplo.com.',
  BLOCKED_IP: 'Esa dirección apunta a una red privada o reservada, y no la podemos revisar.',
  DNS_FAILURE: 'No encontramos ese dominio. Revisá que esté bien escrito.',
  TOO_MANY_REDIRECTS: 'El sitio redirige demasiadas veces y no pudimos llegar a la página.',
  INVALID_REDIRECT: 'El sitio redirige a una dirección inválida.',
  TIMEOUT: 'El sitio tardó demasiado en responder. Probá de nuevo más tarde.',
  ABORTED: 'La revisión se canceló.',
  BODY_TOO_LARGE: 'La página es demasiado pesada para revisarla (más de 2 MB).',
  UNSUPPORTED_ENCODING: 'No pudimos leer la respuesta del sitio.',
  DECODE_ERROR: 'No pudimos leer la respuesta del sitio.',
  TLS_ERROR: 'El certificado de seguridad del sitio no es válido.',
  NETWORK_ERROR:
    'No pudimos conectarnos con el sitio. Puede estar caído o bloqueando visitas automáticas.',
  INTERRUPTED: 'La revisión se interrumpió por un reinicio del servicio. Pedí una nueva.',
  INTERNAL_ERROR: 'Tuvimos un problema al revisar el sitio. Probá de nuevo más tarde.',
  QUEUE_FULL: 'Hay muchas revisiones en curso. Probá de nuevo en unos minutos.',
  RATE_LIMITED: 'Hiciste muchas revisiones seguidas. Esperá un rato y probá de nuevo.',
  DOMAIN_COOLDOWN: 'Ese sitio se acaba de revisar. Esperá unos segundos y probá de nuevo.',
  DAILY_CAP:
    'Se alcanzó el tope diario de revisiones. Se renueva a la medianoche (hora de Buenos Aires).',
  SERVICE_BUSY: 'El servicio está saturado. Probá de nuevo en unos minutos.',
  CONTACT_DISABLED:
    'Por ahora no estamos guardando correos. Borralo y pedí la revisión sin correo.',
  CONSENT_REQUIRED:
    'Para guardar tu correo necesitamos que marques la casilla de consentimiento. Si no querés dejarlo, borralo.',
  PAYLOAD_TOO_LARGE: 'El pedido es demasiado grande.',
  UNSUPPORTED_MEDIA_TYPE: 'El pedido tiene un formato que no aceptamos.',
  NOT_FOUND: 'No encontramos ese informe. Revisá el enlace.',
  EXPIRED: 'Este informe venció (duran 30 días). Pedí una nueva revisión.',
  FORBIDDEN_ORIGIN: 'No pudimos validar el origen del pedido. Entrá desde la página del panel.',
  CSRF_FAILED: 'El formulario venció. Recargá la página y probá de nuevo.',
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  LOGIN_LOCKED: 'Hubo demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.',
  LOGIN_BUSY: 'Hay muchos ingresos en curso. Probá de nuevo en unos segundos.',
  UNAUTHENTICATED: 'Tu sesión venció o no iniciaste sesión. Ingresá de nuevo.',
} as const;

export type ErrorCode = keyof typeof MESSAGES;

export function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(MESSAGES, code);
}

export function messageFor(code: string): string {
  return isErrorCode(code) ? MESSAGES[code] : MESSAGES.INTERNAL_ERROR;
}

/** Errores del scanner con código conocido; cualquier otro se informa como INTERNAL_ERROR. */
export function errorCodeOf(error: unknown): ErrorCode {
  if (
    error instanceof Error &&
    error.name === 'SafeFetchError' &&
    'code' in error &&
    typeof error.code === 'string' &&
    isErrorCode(error.code)
  ) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode): FastifyReply {
  const body: ApiError = { error: { code, message: MESSAGES[code] } };
  return reply.code(status).send(body);
}
