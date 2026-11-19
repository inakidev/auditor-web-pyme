import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scanner',
          root: 'packages/scanner',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
        },
      },
      {
        test: { name: 'api', root: 'apps/api', include: ['src/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: { name: 'web', root: 'apps/web', include: ['src/**/*.test.{ts,tsx}'] },
      },
      {
        test: { name: 'repo', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'apps/api/src/server.ts',
        'apps/api/src/cli/**',
        'apps/api/src/testing/**',
        'apps/web/src/main.tsx',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        'packages/scanner/src/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
