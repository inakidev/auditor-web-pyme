import { normalizeTargetUrl } from '@auditor/scanner';
import {
  AUDIT_TOKEN_PATTERN,
  createAuditRequestSchema,
  type AuditView,
  type CreateAuditResponse,
} from '@auditor/shared';
import type { FastifyInstance } from 'fastify';
import { isErrorCode, messageFor, sendError } from '../errors.js';
import type { JobQueue } from '../jobs/queue.js';
import type { AuditRepository } from '../services/audits.js';
import { generateToken, hashToken } from '../tokens.js';

export const MAX_BODY_BYTES = 2 * 1024;

export interface AuditRoutesDeps {
  readonly repo: AuditRepository;
  readonly queue: JobQueue<number>;
  readonly now: () => Date;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { repo, queue, now } = deps;

  app.post('/api/audits', { bodyLimit: MAX_BODY_BYTES }, (req, reply) => {
    const parsed = createAuditRequestSchema.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_INPUT');

    const target = normalizeTargetUrl(parsed.data.url);
    if (!target.ok)
      return sendError(reply, 400, isErrorCode(target.code) ? target.code : 'INVALID_URL');

    if (!queue.canAccept()) return sendError(reply, 503, 'QUEUE_FULL');

    const token = generateToken();
    const id = repo.create({
      tokenHash: hashToken(token),
      url: target.url,
      domain: target.domain,
      now: now(),
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

    const view: AuditView = {
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
    };
    return reply.send(view);
  });
}
