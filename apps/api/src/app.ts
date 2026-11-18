import type { Finding } from '@auditor/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Db } from './db/client.js';
import { errorCodeOf, sendError } from './errors.js';
import { JobQueue } from './jobs/queue.js';
import { safeSerializers } from './logging.js';
import { registerAuditRoutes } from './routes/audits.js';
import { createAuditRepository } from './services/audits.js';

declare module 'fastify' {
  interface FastifyInstance {
    auditQueue: JobQueue<number>;
  }
}

export interface AuditResult {
  readonly findings: readonly Finding[];
}

export interface AppDeps {
  readonly db: Db;
  readonly runAudit: (url: string) => Promise<AuditResult>;
  readonly logger?: FastifyServerOptions['logger'];
  readonly now?: () => Date;
  readonly queue?: { readonly concurrency: number; readonly maxPending: number };
}

const DEFAULT_QUEUE = { concurrency: 2, maxPending: 20 } as const;

export function buildApp(deps: AppDeps): FastifyInstance {
  const logger =
    deps.logger === undefined || deps.logger === false
      ? false
      : { ...(deps.logger === true ? {} : deps.logger), serializers: safeSerializers };
  const app = Fastify({ logger });
  const now = deps.now ?? (() => new Date());
  const repo = createAuditRepository(deps.db);

  const queue = new JobQueue<number>({
    ...(deps.queue ?? DEFAULT_QUEUE),
    run: async (id) => {
      const audit = repo.findById(id);
      if (audit === undefined) return;
      repo.markRunning(id, now());
      try {
        const result = await deps.runAudit(audit.url);
        repo.markDone(id, result.findings, now());
        app.log.info({ auditId: id, status: 'done' }, 'auditoría terminada');
      } catch (error) {
        const errorCode = errorCodeOf(error);
        repo.markFailed(id, errorCode, now());
        app.log.warn({ auditId: id, status: 'failed', errorCode }, 'auditoría fallida');
      }
    },
  });
  app.decorate('auditQueue', queue);

  app.addHook('onReady', () => {
    for (const id of repo.recover(now())) {
      if (!queue.enqueue(id)) app.log.warn({ auditId: id }, 'cola llena al recuperar');
    }
  });

  app.setErrorHandler((error: { statusCode?: number }, _req, reply) => {
    if (error.statusCode === 413) return sendError(reply, 413, 'PAYLOAD_TOO_LARGE');
    if (error.statusCode === 415) return sendError(reply, 415, 'UNSUPPORTED_MEDIA_TYPE');
    if (error.statusCode === 400) return sendError(reply, 400, 'INVALID_INPUT');
    app.log.error({ errorCode: errorCodeOf(error) }, 'error no controlado');
    return sendError(reply, 500, 'INTERNAL_ERROR');
  });
  app.setNotFoundHandler((_req, reply) => sendError(reply, 404, 'NOT_FOUND'));

  app.get('/api/health', () => ({ status: 'ok' }));
  registerAuditRoutes(app, { repo, queue, now });

  return app;
}
