// Verificación manual de las guías (RF-19): `pnpm check:guides`. No corre en CI.
// Usa safeFetch (regla 1) y respeta 1 request por segundo.
import { setTimeout as sleep } from 'node:timers/promises';
import { GUIDES } from '../src/checks/guides.js';
import { safeFetch } from '../src/net/safe-fetch.js';

const contactUrl = process.env['AUDITOR_CONTACT_URL'] ?? 'https://example.invalid/contacto';
let failures = 0;

for (const [checkId, url] of Object.entries(GUIDES)) {
  let result: string;
  try {
    let res = await safeFetch(url, { contactUrl, method: 'HEAD' });
    // Algunos servidores responden mal a HEAD (405, 501 o incluso 404): se confirma con un GET acotado.
    if (res.status >= 400) {
      res = await safeFetch(url, { contactUrl, maxBodyBytes: 8 * 1024 });
    }
    result = res.status < 400 ? `OK  ${String(res.status)}` : `MAL ${String(res.status)}`;
    if (res.status >= 400) failures += 1;
  } catch (error) {
    failures += 1;
    result = `MAL ${error instanceof Error && 'code' in error ? String(error.code) : 'ERROR'}`;
  }
  console.log(`${result}  ${checkId}  ${url}`);
  await sleep(1000);
}

console.log(
  failures === 0 ? 'Todas las guías responden.' : `${String(failures)} guías con problemas.`,
);
process.exitCode = failures === 0 ? 0 : 1;
