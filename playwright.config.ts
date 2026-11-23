import { defineConfig, devices } from '@playwright/test';

// Pruebas e2e (H16): Chromium real contra la API y la web compiladas, con un runAudit
// simulado (apps/api/src/testing/e2e-server.ts). No usan red externa.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'pnpm --filter "@auditor/web..." build && pnpm --filter @auditor/api exec tsx --conditions=development src/testing/e2e-server.ts',
    url: 'http://localhost:4173/api/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
