// Logs sin datos sensibles (CLAUDE.md, regla 8): ni IP, ni cabeceras, ni tokens de informes.
const TOKEN_ROUTE = /^\/(api\/audits|informe)\/[^/?#]+/;

export function redactUrl(url: string): string {
  const match = TOKEN_ROUTE.exec(url);
  return match === null ? url : `/${match[1] ?? ''}/:token`;
}

/**
 * Reemplazan a los de Fastify: el de request por defecto incluye remoteAddress (IP sin hashear),
 * hostname y remotePort. Solo quedan método, URL redactada y código de respuesta.
 */
export const safeSerializers = {
  req: (req: { method: string; url: string }) => ({ method: req.method, url: redactUrl(req.url) }),
  res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
};

/** Defensa extra por si alguien loguea un objeto a mano. */
export const REDACT_PATHS = [
  'req.body.email',
  'body.email',
  'email',
  '*.email',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.headers.cookie',
  '*.headers.authorization',
  '*.headers["x-csrf-token"]',
  '*.headers["set-cookie"]',
];
