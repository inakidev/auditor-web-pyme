import type {
  AdminAuditItem,
  AdminAuditsQuery,
  AdminLeadItem,
  AdminLeadsQuery,
  Page,
} from '@auditor/shared';
import { and, count, desc, eq, gte, isNotNull, like, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client.js';
import { audits, leads } from '../db/schema.js';

/** Las fechas del panel se interpretan en la hora de Argentina (UTC-3, sin horario de verano). */
const PANEL_UTC_OFFSET = '-03:00';
const DAY_MS = 24 * 60 * 60 * 1000;

function dateRange(column: SQLiteColumn, from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from !== undefined) {
    conditions.push(gte(column, new Date(`${from}T00:00:00${PANEL_UTC_OFFSET}`)));
  }
  if (to !== undefined) {
    const end = new Date(`${to}T00:00:00${PANEL_UTC_OFFSET}`).getTime() + DAY_MS;
    conditions.push(lt(column, new Date(end)));
  }
  return conditions;
}

/** El filtro de dominio ya viene limitado a [a-z0-9.-]: no hay comodines de LIKE que escapar. */
function domainContains(column: SQLiteColumn, domain?: string): SQL[] {
  return domain === undefined ? [] : [like(column, `%${domain}%`)];
}

export function createAdminRepository(db: Db) {
  return {
    listAudits(query: AdminAuditsQuery): Page<AdminAuditItem> {
      const where = and(
        ...domainContains(audits.domain, query.domain),
        ...dateRange(audits.createdAt, query.from, query.to),
        ...(query.status === undefined ? [] : [eq(audits.status, query.status)]),
        ...(query.minScore === undefined ? [] : [gte(audits.scoreTotal, query.minScore)]),
        ...(query.maxScore === undefined ? [] : [lte(audits.scoreTotal, query.maxScore)]),
      );
      const rows = db
        .select({
          id: audits.id,
          url: audits.url,
          domain: audits.domain,
          status: audits.status,
          createdAt: audits.createdAt,
          scoreTotal: audits.scoreTotal,
          scoreBand: audits.scoreBand,
          hasLead: isNotNull(audits.leadId),
        })
        .from(audits)
        .where(where)
        .orderBy(desc(audits.createdAt), desc(audits.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .all();
      const total = db.select({ n: count() }).from(audits).where(where).get()?.n ?? 0;
      return {
        items: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          hasLead: Boolean(r.hasLead),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },

    listLeads(query: AdminLeadsQuery): Page<AdminLeadItem> {
      const where = and(
        ...domainContains(leads.domain, query.domain),
        ...dateRange(leads.createdAt, query.from, query.to),
        ...(query.status === undefined ? [] : [eq(leads.status, query.status)]),
      );
      const rows = db
        .select({
          id: leads.id,
          email: leads.email,
          domain: leads.domain,
          status: leads.status,
          consentAt: leads.consentAt,
          consentTextVersion: leads.consentTextVersion,
          createdAt: leads.createdAt,
          lastAuditId: sql<
            number | null
          >`(select max(${audits.id}) from ${audits} where ${audits.leadId} = ${leads.id})`,
        })
        .from(leads)
        .where(where)
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .all();
      const total = db.select({ n: count() }).from(leads).where(where).get()?.n ?? 0;
      return {
        items: rows.map((r) => ({
          ...r,
          consentAt: r.consentAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },

    leadOf(leadId: number | null) {
      if (leadId === null) return null;
      const row = db
        .select({
          email: leads.email,
          consentAt: leads.consentAt,
          consentTextVersion: leads.consentTextVersion,
        })
        .from(leads)
        .where(eq(leads.id, leadId))
        .get();
      return row === undefined ? null : { ...row, consentAt: row.consentAt.toISOString() };
    },
  };
}

export type AdminRepository = ReturnType<typeof createAdminRepository>;
