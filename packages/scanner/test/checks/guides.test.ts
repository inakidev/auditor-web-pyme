import { describe, expect, it } from 'vitest';
import { GUIDE_HOSTS, GUIDES } from '../../src/checks/guides.js';
import { ALL_CHECKS } from '../../src/checks/index.js';
import { context } from './fixtures.js';

// RF-19: cada recomendación puede enlazar una guía. Las URLs son constantes del código,
// nunca salen del sitio auditado.

describe('guías', () => {
  it('solo hay guías para checks que existen', () => {
    const ids = new Set(ALL_CHECKS.map((c) => c.id));
    for (const id of Object.keys(GUIDES)) expect(ids.has(id), id).toBe(true);
  });

  it('todas son https y de fuentes de la lista permitida', () => {
    for (const [id, url] of Object.entries(GUIDES)) {
      const parsed = new URL(url);
      expect(parsed.protocol, id).toBe('https:');
      expect(GUIDE_HOSTS.has(parsed.hostname), `${id}: ${parsed.hostname}`).toBe(true);
    }
  });

  it('los hallazgos llevan la guía de su check (o null)', async () => {
    const findings = (await Promise.all(ALL_CHECKS.map((c) => c.run(context())))).flat();
    for (const finding of findings) {
      expect(finding.guide).toBe(GUIDES[finding.checkId] ?? null);
    }
    expect(findings.some((f) => f.guide !== null)).toBe(true);
  });
});
