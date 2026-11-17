import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

export interface BuildAppOptions {
  readonly logger?: FastifyServerOptions['logger'];
}

/**
 * Logs sin IP ni cabeceras: solo método y ruta (regla de seguridad 8).
 */
const safeSerializers = {
  req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const logger =
    options.logger === undefined || options.logger === false
      ? false
      : { ...(options.logger === true ? {} : options.logger), serializers: safeSerializers };

  const app = Fastify({ logger });

  app.get('/api/health', () => ({ status: 'ok' }));

  return app;
}
