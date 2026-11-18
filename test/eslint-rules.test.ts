import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// Verifica la regla de seguridad 1: ninguna request saliente fuera de safeFetch (RNF-01).
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

const NET_RULES = [
  'no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
];

const BLOCKED = [
  ["fetch('http://x');", 'no-restricted-globals'],
  ["void globalThis.fetch('http://x');", 'no-restricted-properties'],
  ["void window.fetch('http://x');", 'no-restricted-properties'],
  ["void self.fetch('http://x');", 'no-restricted-properties'],
  ['new XMLHttpRequest();', 'no-restricted-globals'],
  ["import http from 'http'; void http;", 'no-restricted-imports'],
  ["import http from 'node:http'; void http;", 'no-restricted-imports'],
  ["import https from 'https'; void https;", 'no-restricted-imports'],
  ["import https from 'node:https'; void https;", 'no-restricted-imports'],
  ["import net from 'net'; void net;", 'no-restricted-imports'],
  ["import tls from 'node:tls'; void tls;", 'no-restricted-imports'],
  ["import axios from 'axios'; void axios;", 'no-restricted-imports'],
  ["import { request } from 'undici'; void request;", 'no-restricted-imports'],
  ["void import('node:http');", 'no-restricted-syntax'],
  ["void import('https');", 'no-restricted-syntax'],
  ["import { fromURL } from 'cheerio'; void fromURL;", 'no-restricted-imports'],
] as const;

describe('regla anti-fetch (fuera de safeFetch)', () => {
  it.each(BLOCKED)('bloquea %s en apps/api', async (code, rule) => {
    expect(await ruleIds(code, 'apps/api/src/probe.ts')).toContain(rule);
  });

  it('permite cheerio.load (parseo sin red)', async () => {
    const code = "import { load } from 'cheerio'; void load('<p>x</p>');";
    expect(await ruleIds(code, 'packages/scanner/src/checks/probe.ts')).not.toContain(
      'no-restricted-imports',
    );
  });

  it('bloquea fetch también en el scanner fuera de net/', async () => {
    expect(await ruleIds("fetch('http://x');", 'packages/scanner/src/checks/probe.ts')).toContain(
      'no-restricted-globals',
    );
  });

  it('permite node:http y node:https dentro de packages/scanner/src/net', async () => {
    const code = "import http from 'node:http'; import https from 'https'; void http; void https;";
    const ids = await ruleIds(code, 'packages/scanner/src/net/probe.ts');
    expect(ids.filter((id) => NET_RULES.includes(id))).toEqual([]);
  });

  it('no permite fetch global ni siquiera dentro de net/', async () => {
    expect(await ruleIds("fetch('http://x');", 'packages/scanner/src/net/probe.ts')).toContain(
      'no-restricted-globals',
    );
  });

  it('permite http/https (con y sin node:) en pruebas del scanner, para servidores de fixture', async () => {
    const code =
      "import a from 'http'; import b from 'node:http'; import c from 'https'; import d from 'node:https'; void [a, b, c, d];";
    const ids = await ruleIds(code, 'packages/scanner/test/probe.test.ts');
    expect(ids.filter((id) => NET_RULES.includes(id))).toEqual([]);
  });

  it('sigue bloqueando net y tls en pruebas del scanner', async () => {
    const code = "import net from 'node:net'; import tls from 'tls'; void [net, tls];";
    const ids = await ruleIds(code, 'packages/scanner/test/probe.test.ts');
    expect(ids.filter((id) => id === 'no-restricted-imports')).toHaveLength(2);
  });

  it('no extiende la excepción a pruebas fuera del scanner', async () => {
    const code = "import http from 'node:http'; void http;";
    expect(await ruleIds(code, 'apps/api/src/probe.test.ts')).toContain('no-restricted-imports');
  });

  it('permite fetch solo en apps/web/src/lib/api-client.ts', async () => {
    const code = "void fetch('/api/health');";
    expect(await ruleIds(code, 'apps/web/src/lib/api-client.ts')).not.toContain(
      'no-restricted-globals',
    );
    expect(await ruleIds(code, 'apps/web/src/pages/probe.ts')).toContain('no-restricted-globals');
  });

  it('bloquea dangerouslySetInnerHTML', async () => {
    const code = 'export const X = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;';
    expect(await ruleIds(code, 'apps/web/src/components/probe.tsx')).toContain(
      'no-restricted-syntax',
    );
  });
});
