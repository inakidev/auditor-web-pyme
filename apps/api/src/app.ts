import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import type { AuditPhase, Finding } from '@auditor/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createGuards } from './auth/guard.js';
import { VerifyLimiter } from './auth/passwords.js';
import type { AuthConfig } from './config.js';
import type { Db } from './db/client.js';
import { errorCodeOf, sendError } from './errors.js';
import { JobQueue } from './jobs/queue.js';
import { REDACT_PATHS, safeSerializers } from './logging.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerAuthRoutes } from './routes/auth.js';
import { createAdminRepository } from './services/admin.js';
import { createAuditRepository } from './services/audits.js';
import { createAuthRepository } from './services/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    auditQueue: JobQueue<number>;
    /** "MÉTODO /ruta" de cada ruta registrada (la prueba de rutas exige clasificarlas todas). */
    registeredRoutes: readonly string[];
  }
}

export interface AuditResult {
  readonly findings: readonly Finding[];
}

export interface AppDeps {
  readonly db: Db;
  readonly runAudit: (url: string, onPhase: (phase: AuditPhase) => void) => Promise<AuditResult>;
  readonly logger?: FastifyServerOptions['logger'];
  readonly now?: () => Date;
  readonly queue?: { readonly concurrency: number; readonly maxPending: number };
  readonly auth: AuthConfig;
  /** Verificaciones argon2 simultáneas y en espera; si se llena, 503. */
  readonly verifyLimiter?: { readonly concurrency: number; readonly maxWaiting: number };
}

const DEFAULT_QUEUE = { concurrency: 2, maxPending: 20 } as const;
const DEFAULT_VERIFY_LIMITER = { concurrency: 2, maxWaiting: 8 } as const;
const PRIVATE_PREFIXES = ['/api/auth/', '/api/admin/'];

export function buildApp(deps: AppDeps): FastifyInstance {
  const logger =
    deps.logger === undefined || deps.logger === false
      ? false
      : {
          ...(deps.logger === true ? {} : deps.logger),
          serializers: safeSerializers,
          // Defensa extra: correos, cookies y tokens nunca llegan a los logs (regla 8).
          redact: { paths: REDACT_PATHS, censor: '[oculto]' },
        };
  const app = Fastify({ logger });
  const now = deps.now ?? (() => new Date());
  const repo = createAuditRepository(deps.db);
  const authRepo = createAuthRepository(deps.db);
  const guards = createGuards({ repo: authRepo, publicOrigin: deps.auth.publicOrigin, now });

  const routes: string[] = [];
  app.decorate('registeredRoutes', routes);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push(`${method} ${route.url}`);
  });
  app.decorateRequest('session', null);
  // Fase de cada auditoría en curso: solo en memoria, sin columna en la base.
  const phases = new Map<number, AuditPhase>();

  const queue = new JobQueue<number>({
    ...(deps.queue ?? DEFAULT_QUEUE),
    run: async (id) => {
      const audit = repo.findById(id);
      if (audit === undefined) return;
      repo.markRunning(id, now());
      try {
        const result = await deps.runAudit(audit.url, (phase) => phases.set(id, phase));
        phases.set(id, 'scoring');
        repo.markDone(id, result.findings, now());
        app.log.info({ auditId: id, status: 'done' }, 'auditoría terminada');
      } catch (error) {
        const errorCode = errorCodeOf(error);
        repo.markFailed(id, errorCode, now());
        app.log.warn({ auditId: id, status: 'failed', errorCode }, 'auditoría fallida');
      } finally {
        phases.delete(id);
      }
    },
  });
  app.decorate('auditQueue', queue);

  // Cabeceras de seguridad (regla 9). La API solo devuelve JSON: CSP que no permite nada.
  void app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  void app.register(cookie);

  // Respuestas de sesión y del panel: nunca en caché (tampoco los errores).
  app.addHook('onRequest', (req, reply, done) => {
    if (PRIVATE_PREFIXES.some((prefix) => req.url.startsWith(prefix))) {
      reply.header('cache-control', 'no-store');
    }
    done();
  });

  app.addHook('onReady', () => {
    // Primer usuario: solo si no existe ninguno (nunca pisa una contraseña).
    if (deps.auth.admin !== null && authRepo.ensureFirstUser(deps.auth.admin, now())) {
      app.log.info('primer usuario creado');
    }
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
  const phaseOf = (id: number) => phases.get(id) ?? null;
  registerAuditRoutes(app, { repo, queue, now, phaseOf });
  registerAuthRoutes(app, {
    repo: authRepo,
    guards,
    limiter: new VerifyLimiter(deps.verifyLimiter ?? DEFAULT_VERIFY_LIMITER),
    ipHashSalt: deps.auth.ipHashSalt,
    publicOrigin: deps.auth.publicOrigin,
    now,
  });
  registerAdminRoutes(app, {
    admin: createAdminRepository(deps.db),
    audits: repo,
    guards,
    phaseOf,
  });

  return app;
}
