import { normalizeTargetUrl } from '@auditor/scanner';
import {
  AUDIT_TOKEN_PATTERN,
  createAuditRequestSchema,
  type AuditPhase,
  type AuditView,
  type CreateAuditResponse,
} from '@auditor/shared';
import type { FastifyInstance } from 'fastify';
import { usageKey } from '../auth/keys.js';
import { isErrorCode, messageFor, sendError } from '../errors.js';
import type { JobQueue } from '../jobs/queue.js';
import { retryAfterSeconds, type UsageLimiter } from '../limits/usage-limits.js';
import { scoresOf, type AuditRepository, type AuditRow } from '../services/audits.js';
import { generateToken, hashToken } from '../tokens.js';

export const MAX_BODY_BYTES = 2 * 1024;

/** Vista pública de una auditoría (también la usa el panel). */
export function toAuditView(
  audit: AuditRow,
  repo: AuditRepository,
  phaseOf: (id: number) => AuditPhase | null,
): AuditView {
  return {
    status: audit.status,
    url: audit.url,
    createdAt: audit.createdAt.toISOString(),
    finishedAt: audit.finishedAt?.toISOString() ?? null,
    expiresAt: audit.expiresAt.toISOString(),
    error:
      audit.errorCode === null
        ? null
        : { code: audit.errorCode, message: messageFor(audit.errorCode) },
    findings: audit.status === 'done' ? repo.findingsOf(audit.id) : [],
    scores: audit.status === 'done' ? scoresOf(audit) : null,
    phase: audit.status === 'running' ? phaseOf(audit.id) : null,
  };
}

export interface AuditRoutesDeps {
  readonly repo: AuditRepository;
  readonly queue: JobQueue<number>;
  readonly now: () => Date;
  readonly phaseOf: (id: number) => AuditPhase | null;
  readonly limiter: UsageLimiter;
  readonly ipHashSalt: string;
  /** Apagado: se rechazan los correos (hasta publicar los textos legales). */
  readonly contactCaptureEnabled: boolean;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { repo, queue, now, phaseOf, limiter, ipHashSalt, contactCaptureEnabled } = deps;

  app.post('/api/audits', { bodyLimit: MAX_BODY_BYTES }, (req, reply) => {
    const parsed = createAuditRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_INPUT');

    const target = normalizeTargetUrl(parsed.data.url);
    if (!target.ok)
      return sendError(reply, 400, isErrorCode(target.code) ? target.code : 'INVALID_URL');

    // Sin consentimiento expreso no se guarda el correo (RF-11).
    const { email, consent } = parsed.data;
    if (email !== undefined && !contactCaptureEnabled) {
      return sendError(reply, 400, 'CONTACT_DISABLED');
    }
    if (email !== undefined && consent !== true) return sendError(reply, 400, 'CONSENT_REQUIRED');

    // Límites de uso (RF-15): se revisan todos antes de consumir cupo.
    const usage = { ipKey: usageKey(ipHashSalt, req.ip), domain: target.domain };
    const verdict = limiter.check(usage, now().getTime());
    if (!verdict.ok) {
      reply.header('retry-after', String(retryAfterSeconds(verdict.retryAfterMs)));
      return sendError(reply, 429, verdict.code);
    }
    if (!queue.canAccept()) return sendError(reply, 503, 'QUEUE_FULL');
    limiter.commit(usage, now().getTime());

    const token = generateToken();
    const id = repo.create({
      tokenHash: hashToken(token),
      url: target.url,
      domain: target.domain,
      now: now(),
      ...(email === undefined ? {} : { lead: { email } }),
    });
    queue.enqueue(id);
    const body: CreateAuditResponse = { token };
    return reply.code(202).send(body);
  });

  app.get<{ Params: { token: string } }>('/api/audits/:token', (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { token } = req.params;
    if (!AUDIT_TOKEN_PATTERN.test(token)) return sendError(reply, 404, 'NOT_FOUND');

    const audit = repo.findByTokenHash(hashToken(token));
    if (audit === undefined) return sendError(reply, 404, 'NOT_FOUND');
    if (audit.expiresAt.getTime() <= now().getTime()) return sendError(reply, 410, 'EXPIRED');

    return reply.send(toAuditView(audit, repo, phaseOf));
  });
}
