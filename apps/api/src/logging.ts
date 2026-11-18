// Logs sin datos sensibles (CLAUDE.md, regla 8): ni IP, ni cabeceras, ni tokens de informes.
const TOKEN_ROUTE = /^\/(api\/audits|informe)\/[^/?#]+/;

export function redactUrl(url: string): string {
  const match = TOKEN_ROUTE.exec(url);
  return match === null ? url : `/${match[1] ?? ''}/:token`;
}

export const safeSerializers = {
  req: (req: { method: string; url: string }) => ({ method: req.method, url: redactUrl(req.url) }),
};
