import type { Finding } from '@auditor/shared';
import { safeFetch } from '../net/safe-fetch.js';

export interface RunAuditOptions {
  /** URL de contacto para el User-Agent (AUDITOR_CONTACT_URL). */
  readonly contactUrl: string;
}

export interface AuditResult {
  readonly findings: readonly Finding[];
}

/**
 * Orquestador de la auditoría. En H2 solo descarga la página principal; los checks de
 * seguridad se agregan en H3.
 */
export async function runAudit(url: string, options: RunAuditOptions): Promise<AuditResult> {
  await safeFetch(url, { contactUrl: options.contactUrl, acceptEncoding: 'gzip-br' });
  return { findings: [] };
}
