import {
  adminAuditsQuerySchema,
  adminLeadsQuerySchema,
  type AdminAuditDetail,
  type AuditPhase,
} from '@auditor/shared';
import type { FastifyInstance } from 'fastify';
import type { createGuards } from '../auth/guard.js';
import { sendError } from '../errors.js';
import type { AdminRepository } from '../services/admin.js';
import type { AuditRepository } from '../services/audits.js';
import { toAuditView } from './audits.js';

export interface AdminRoutesDeps {
  readonly admin: AdminRepository;
  readonly audits: AuditRepository;
  readonly guards: ReturnType<typeof createGuards>;
  readonly phaseOf: (id: number) => AuditPhase | null;
}

const ID_PATTERN = /^[1-9]\d{0,15}$/;

/** Panel de consultores (RF-12, RF-16): todo exige sesión vigente; borrar exige además CSRF. */
export function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps): void {
  const { admin, audits, guards, phaseOf } = deps;
  const onRequest = guards.requireSession;

  app.get('/api/admin/audits', { onRequest }, (req, reply) => {
    const query = adminAuditsQuerySchema.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'INVALID_INPUT');
    return reply.send(admin.listAudits(query.data));
  });

  app.get<{ Params: { id: string } }>('/api/admin/audits/:id', { onRequest }, (req, reply) => {
    const { id } = req.params;
    const audit = ID_PATTERN.test(id) ? audits.findById(Number(id)) : undefined;
    if (audit === undefined) return sendError(reply, 404, 'NOT_FOUND');
    const body: AdminAuditDetail = {
      id: audit.id,
      domain: audit.domain,
      audit: toAuditView(audit, audits, phaseOf),
      lead: admin.leadOf(audit.leadId),
    };
    return reply.send(body);
  });

  // Borrado manual (RF-16): mutaciones con sesión, Origin y token CSRF.
  const mutation = { onRequest, preHandler: guards.requireCsrf };

  app.delete<{ Params: { id: string } }>('/api/admin/audits/:id', mutation, (req, reply) => {
    const { id } = req.params;
    if (!ID_PATTERN.test(id) || !audits.deleteAudit(Number(id))) {
      return sendError(reply, 404, 'NOT_FOUND');
    }
    req.log.info({ auditId: Number(id) }, 'auditoría borrada desde el panel');
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/admin/leads/:id', mutation, (req, reply) => {
    const { id } = req.params;
    if (!ID_PATTERN.test(id) || !admin.deleteLead(Number(id))) {
      return sendError(reply, 404, 'NOT_FOUND');
    }
    req.log.info({ leadId: Number(id) }, 'contacto borrado desde el panel');
    return reply.code(204).send();
  });

  app.get('/api/admin/leads', { onRequest }, (req, reply) => {
    const query = adminLeadsQuerySchema.safeParse(req.query);
    if (!query.success) return sendError(reply, 400, 'INVALID_INPUT');
    return reply.send(admin.listLeads(query.data));
  });
}
