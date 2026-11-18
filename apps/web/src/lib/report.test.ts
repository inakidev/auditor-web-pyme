import type { AuditView, Finding } from '@auditor/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api-client.js';
import { POLL_INTERVAL_MS, pollInterval, retryDelay, shouldRetry } from './polling.js';
import { countByStatus, sortFindings } from './report.js';

const view = (status: AuditView['status']): AuditView => ({
  status,
  url: 'https://ejemplo.com/',
  createdAt: '',
  finishedAt: null,
  expiresAt: '',
  error: null,
  findings: [],
});

describe('consulta periódica', () => {
  it('consulta cada 2 s mientras espera o corre, y corta en done o failed', () => {
    expect(pollInterval(undefined)).toBe(POLL_INTERVAL_MS);
    expect(pollInterval(view('queued'))).toBe(POLL_INTERVAL_MS);
    expect(pollInterval(view('running'))).toBe(POLL_INTERVAL_MS);
    expect(pollInterval(view('done'))).toBe(false);
    expect(pollInterval(view('failed'))).toBe(false);
  });

  it('no reintenta si el informe no existe o venció; ante otros errores reintenta hasta 4 veces', () => {
    expect(shouldRetry(0, new ApiRequestError(404, 'NOT_FOUND', ''))).toBe(false);
    expect(shouldRetry(0, new ApiRequestError(410, 'EXPIRED', ''))).toBe(false);
    expect(shouldRetry(0, new ApiRequestError(0, 'NETWORK', ''))).toBe(true);
    expect(shouldRetry(4, new ApiRequestError(503, 'X', ''))).toBe(false);
  });

  it('espacia los reintentos con espera exponencial y un tope', () => {
    expect([0, 1, 2, 3, 10].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 30000]);
  });
});

const f = (checkId: string, status: Finding['status'], severity: Finding['severity']): Finding => ({
  checkId,
  category: 'security',
  status,
  severity,
  title: checkId,
  evidence: null,
  recommendation: '',
  effort: 'low',
});

describe('orden y resumen del informe', () => {
  it('ordena primero lo que no cumple y, dentro de cada estado, por severidad', () => {
    const sorted = sortFindings([
      f('pass-crit', 'pass', 'critical'),
      f('warn-low', 'warn', 'low'),
      f('fail-low', 'fail', 'low'),
      f('fail-crit', 'fail', 'critical'),
      f('na', 'na', 'high'),
    ]);
    expect(sorted.map((x) => x.checkId)).toEqual([
      'fail-crit',
      'fail-low',
      'warn-low',
      'pass-crit',
      'na',
    ]);
  });

  it('cuenta los hallazgos por estado', () => {
    expect(
      countByStatus([f('a', 'fail', 'low'), f('b', 'fail', 'low'), f('c', 'pass', 'low')]),
    ).toEqual({
      fail: 2,
      warn: 0,
      pass: 1,
      na: 0,
    });
  });
});
