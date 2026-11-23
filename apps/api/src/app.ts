import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import type { AuditPhase, Finding, PublicConfig } from '@auditor/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createGuards } from './auth/guard.js';
import { VerifyLimiter } from './auth/passwords.js';
import { DEFAULT_LIMITS, type AuthConfig, type UsageLimitsConfig } from './config.js';
import type { Db } from './db/client.js';
import { errorCodeOf, sendError } from './errors.js';
import { PURGE_INTERVAL_MS, purgeExpired } from './jobs/purge.js';
import { JobQueue } from './jobs/queue.js';
import { MAX_LIMIT_KEYS, UsageLimiter } from './limits/usage-limits.js';
import { REDACT_PATHS, safeSerializers } from './logging.js';
import { loadWebAssets, sendAsset } from './static/serve-web.js';
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
  /** Topes de uso (RF-15). La concurrencia y la cola salen de acá salvo que se pase `queue`. */
  readonly limits?: UsageLimitsConfig;
  /** Saltos de proxy de confianza (0 = conexión directa, se ignora X-Forwarded-For). */
  readonly trustProxyHops?: number;
  /** Diagnóstico temporal: cuántas entradas trae X-Forwarded-For (nunca las IP). */
  readonly logProxyChain?: boolean;
  readonly contactCaptureEnabled?: boolean;
  readonly demoNotice?: boolean;
  /** Carpeta de la web compilada. Sin ella (desarrollo con Vite) solo se sirve la API. */
  readonly webDist?: string;
}
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
  const hops = deps.trustProxyHops ?? 0;
  // Fastify 5.12 ignora trustProxy numérico (falla cerrado). Confiamos en los primeros `hops`
  // saltos a mano: sirve solo si al servicio se llega únicamente a través del proxy (Render).
  const trustProxy = (_address: string, hop: number) => hop < hops;
  const app = Fastify({ logger, ...(hops > 0 ? { trustProxy } : {}) });
  const limits = deps.limits ?? DEFAULT_LIMITS;
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
    ...(deps.queue ?? { concurrency: limits.concurrency, maxPending: limits.maxPending }),
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

  // Purga de lo vencido (H14): al arrancar y cada hora.
  let purgeTimer: NodeJS.Timeout | undefined;
  const runPurge = () => {
    try {
      const purged = purgeExpired(deps.db, now());
      if (Object.values(purged).some((n) => n > 0)) app.log.info({ purged }, 'purga de vencidos');
    } catch (error) {
      app.log.error({ errorCode: errorCodeOf(error) }, 'falló la purga de vencidos');
    }
  };

  app.addHook('onReady', () => {
    // Primer usuario: solo si no existe ninguno (nunca pisa una contraseña).
    if (deps.auth.admin !== null && authRepo.ensureFirstUser(deps.auth.admin, now())) {
      app.log.info('primer usuario creado');
    }
    // Primero la purga: así no se reencola un informe vencido.
    runPurge();
    for (const id of repo.recover(now())) {
      if (!queue.enqueue(id)) app.log.warn({ auditId: id }, 'cola llena al recuperar');
    }
    purgeTimer = setInterval(runPurge, PURGE_INTERVAL_MS);
    purgeTimer.unref();
  });
  app.addHook('onClose', () => {
    if (purgeTimer !== undefined) clearInterval(purgeTimer);
  });

  app.setErrorHandler((error: { statusCode?: number }, _req, reply) => {
    if (error.statusCode === 413) return sendError(reply, 413, 'PAYLOAD_TOO_LARGE');
    if (error.statusCode === 415) return sendError(reply, 415, 'UNSUPPORTED_MEDIA_TYPE');
    if (error.statusCode === 400) return sendError(reply, 400, 'INVALID_INPUT');
    app.log.error({ errorCode: errorCodeOf(error) }, 'error no controlado');
    return sendError(reply, 500, 'INTERNAL_ERROR');
  });
  // La web compilada se sirve desde el manejador de "no encontrado": no agrega rutas y nunca
  // tapa las de la API. Solo GET y HEAD.
  const web = deps.webDist === undefined ? null : loadWebAssets(deps.webDist);
  app.setNotFoundHandler((req, reply) => {
    if (web !== null && (req.method === 'GET' || req.method === 'HEAD')) {
      const found = web.resolve(req.url);
      if (found.kind === 'asset') return sendAsset(reply, found.asset);
    }
    return sendError(reply, 404, 'NOT_FOUND');
  });

  if (deps.logProxyChain === true) {
    app.addHook('onRequest', (req, _reply, done) => {
      const xff = req.headers['x-forwarded-for'];
      const entries = typeof xff === 'string' ? xff.split(',').length : 0;
      req.log.info({ xffEntries: entries, trustProxyHops: hops }, 'cadena de proxies');
      done();
    });
  }

  // Lo consulta un ping externo cada pocos minutos: sin base, sin trabajo y sin log.
  app.get('/api/health', { logLevel: 'silent' }, () => ({ status: 'ok' }));
  const publicConfig: PublicConfig = {
    contactCapture: deps.contactCaptureEnabled ?? true,
    demoNotice: deps.demoNotice ?? true,
  };
  app.get('/api/config', () => publicConfig);

  const phaseOf = (id: number) => phases.get(id) ?? null;
  registerAuditRoutes(app, {
    repo,
    queue,
    now,
    phaseOf,
    limiter: new UsageLimiter({ ...limits, maxKeys: MAX_LIMIT_KEYS }),
    ipHashSalt: deps.auth.ipHashSalt,
    contactCaptureEnabled: publicConfig.contactCapture,
  });
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
