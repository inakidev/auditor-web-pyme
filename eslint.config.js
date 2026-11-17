// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Regla de seguridad 1 (CLAUDE.md): toda request saliente pasa por safeFetch.
const NET_MESSAGE =
  'Prohibido: toda request saliente pasa por safeFetch (packages/scanner/src/net/safe-fetch.ts).';

const NODE_NET_MODULES = ['http', 'https', 'http2', 'net', 'tls', 'dgram'];
const SERVER_MODULES_FOR_TESTS = ['http', 'https'];
const HTTP_CLIENT_PACKAGES = [
  'undici',
  'axios',
  'node-fetch',
  'got',
  'ky',
  'superagent',
  'request',
];
const NET_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
const GLOBAL_OBJECTS = ['globalThis', 'window', 'self', 'global'];

/** @param {string[]} modules */
const withNodePrefix = (modules) => modules.flatMap((m) => [m, `node:${m}`]);

/** @param {string[]} nodeModules */
const restrictedImports = (nodeModules) => [
  'error',
  {
    paths: [...withNodePrefix(nodeModules), ...HTTP_CLIENT_PACKAGES].map((name) => ({
      name,
      message: NET_MESSAGE,
    })),
    patterns: [{ group: HTTP_CLIENT_PACKAGES.map((p) => `${p}/*`), message: NET_MESSAGE }],
  },
];

/** @param {string[]} names */
const restrictedGlobals = (names) => [
  'error',
  ...names.map((name) => ({ name, message: NET_MESSAGE })),
];

const restrictedProperties = (/** @type {string[]} */ names) => [
  'error',
  ...GLOBAL_OBJECTS.flatMap((object) =>
    names.map((property) => ({ object, property, message: NET_MESSAGE })),
  ),
];

const NO_DANGEROUS_HTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: 'Prohibido dangerouslySetInnerHTML (regla de seguridad 4).',
};

const dynamicImportOf = (/** @type {string[]} */ nodeModules) => ({
  selector: `ImportExpression[source.value=/^(node:)?(${nodeModules.join('|')})$/]`,
  message: NET_MESSAGE,
});

export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
    rules: {
      'no-restricted-imports': restrictedImports(NODE_NET_MODULES),
      'no-restricted-globals': restrictedGlobals(NET_GLOBALS),
      'no-restricted-properties': restrictedProperties(NET_GLOBALS),
      'no-restricted-syntax': ['error', NO_DANGEROUS_HTML, dynamicImportOf(NODE_NET_MODULES)],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Único lugar donde se abren conexiones salientes.
    files: ['packages/scanner/src/net/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', NO_DANGEROUS_HTML],
    },
  },
  {
    // Las pruebas del scanner levantan servidores de fixture locales.
    files: ['packages/scanner/**/*.test.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(
        NODE_NET_MODULES.filter((m) => !SERVER_MODULES_FOR_TESTS.includes(m)),
      ),
      'no-restricted-syntax': [
        'error',
        NO_DANGEROUS_HTML,
        dynamicImportOf(NODE_NET_MODULES.filter((m) => !SERVER_MODULES_FOR_TESTS.includes(m))),
      ],
    },
  },
  {
    // El navegador llama a nuestra propia API (mismo origen): no es una request a sitios auditados.
    files: ['apps/web/src/lib/api-client.ts'],
    rules: {
      'no-restricted-globals': restrictedGlobals(NET_GLOBALS.filter((g) => g !== 'fetch')),
      'no-restricted-properties': restrictedProperties(NET_GLOBALS.filter((g) => g !== 'fetch')),
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
