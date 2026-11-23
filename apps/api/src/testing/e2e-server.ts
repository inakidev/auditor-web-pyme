// Servidor para las pruebas e2e (H16): la app real (API + web compilada) con un runAudit
// simulado, para no auditar sitios de terceros ni depender de la red. No va al build.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_PHASES, type Finding } from '@auditor/shared';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { TEST_AUTH } from './support.js';

export const E2E_PORT = 4173;
export const E2E_ORIGIN = `http://localhost:${String(E2E_PORT)}`;

const finding = (over: Partial<Finding>): Finding => ({
  checkId: 'SEC-05',
  category: 'security',
  status: 'fail',
  severity: 'high',
  title: 'Falta la cabecera HSTS',
  evidence: null,
  recommendation: 'Agregá la cabecera Strict-Transport-Security.',
  effort: 'low',
  guide: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
  ...over,
});

/** Hallazgos de fixture, con evidencia maliciosa para comprobar que se muestra escapada. */
const FINDINGS: Finding[] = [
  finding({}),
  finding({
    checkId: 'SEC-03',
    severity: 'critical',
    title: 'El certificado vence pronto',
    recommendation: 'Renová el certificado.',
    guide: null,
  }),
  finding({
    checkId: 'SEO-01',
    category: 'seo',
    severity: 'medium',
    title: 'El título es muy largo',
    evidence: '<script>window.__xss = true</script><img src=x onerror="window.__xss=true">',
    recommendation: 'Acortá el título a menos de 60 caracteres.',
    guide: null,
  }),
  finding({ checkId: 'SEC-01', status: 'pass', title: 'El sitio usa HTTPS', guide: null }),
  finding({
    checkId: 'ANA-01',
    category: 'analytics',
    status: 'warn',
    severity: 'medium',
    title: 'No detectamos analítica en el HTML inicial',
    recommendation: 'Instalá una herramienta de medición.',
    guide: null,
  }),
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const app = buildApp({
  db: openDatabase(join(mkdtempSync(join(tmpdir(), 'auditor-e2e-')), 'e2e.db')),
  runAudit: async (_url, onPhase) => {
    for (const phase of AUDIT_PHASES) {
      onPhase(phase);
      await sleep(150);
    }
    return { findings: FINDINGS };
  },
  auth: { ...TEST_AUTH, publicOrigin: E2E_ORIGIN },
  webDist: fileURLToPath(new URL('../../../web/dist', import.meta.url)),
  logger: false,
});

await app.listen({ host: 'localhost', port: E2E_PORT });
