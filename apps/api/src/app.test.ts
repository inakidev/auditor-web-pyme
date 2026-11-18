import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';

const deps = () => ({
  db: openDatabase(':memory:'),
  runAudit: () => Promise.resolve({ findings: [] }),
});

describe('GET /api/health', () => {
  it('responde 200 con status ok', async () => {
    const app = buildApp(deps());
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('acepta logger habilitado sin romper', async () => {
    const app = buildApp({ ...deps(), logger: { level: 'silent' } });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
