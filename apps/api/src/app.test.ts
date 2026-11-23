import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { users } from './db/schema.js';
import { TEST_AUTH } from './testing/support.js';

const deps = () => ({
  db: openDatabase(':memory:'),
  runAudit: () => Promise.resolve({ findings: [] }),
  auth: TEST_AUTH,
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

describe('arranque con base vacía (disco efímero de Render)', () => {
  it('migra y crea el primer usuario; tras perder la base vuelve a arrancar igual', async () => {
    const auth = TEST_AUTH;
    const dir = mkdtempSync(join(tmpdir(), 'auditor-db-'));
    const path = join(dir, 'data', 'auditor.db');
    try {
      for (let ciclo = 0; ciclo < 2; ciclo++) {
        const db = openDatabase(path);
        const app = buildApp({ db, runAudit: () => Promise.resolve({ findings: [] }), auth });
        await app.ready();
        expect(db.select({ email: users.email }).from(users).all()).toEqual([
          { email: auth.admin?.email },
        ]);
        expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
        await app.close();
        db.$client.close();
        // Lo que pasa en Render al reiniciar: el archivo de la base desaparece.
        rmSync(join(dir, 'data'), { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
