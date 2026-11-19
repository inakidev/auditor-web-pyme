import type { Finding } from '@auditor/shared';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { TRUST_CHECKS } from '../../src/checks/index.js';
import { context } from './fixtures.js';

// Confianza y contacto (RF-06): TRU-01 a TRU-05, sin red. La evidencia nunca copia datos.

async function run(id: string, html: string | null): Promise<Finding> {
  const check = TRUST_CHECKS.find((c) => c.id === id);
  if (check === undefined) throw new Error(`Falta ${id}`);
  const [finding] = (await check.run(context({ html: html === null ? null : load(html) }))) as [
    Finding,
  ];
  expect(finding.category).toBe('trust');
  return finding;
}

const PHONE = '+54 9 280 455-1234';
const EMAIL = 'turnos@clinica.com.ar';

describe('catálogo', () => {
  it('incluye TRU-01 a TRU-05 y sin HTML quedan como no evaluados', async () => {
    expect(TRUST_CHECKS.map((c) => c.id)).toEqual([
      'TRU-01',
      'TRU-02',
      'TRU-03',
      'TRU-04',
      'TRU-05',
    ]);
    for (const check of TRUST_CHECKS) {
      expect((await run(check.id, null)).status).toBe('not_evaluated');
    }
  });
});

describe('TRU-01 medios de contacto visibles', () => {
  it('detecta teléfono y correo en el texto sin copiarlos en la evidencia', async () => {
    const f = await run(
      'TRU-01',
      `<body><p>Llamanos al ${PHONE} o escribinos a ${EMAIL}</p></body>`,
    );
    expect(f.status).toBe('pass');
    expect(f.evidence).toMatch(/teléfono/);
    expect(f.evidence).toMatch(/correo/);
    expect(f.evidence).not.toContain('455');
    expect(f.evidence).not.toContain('clinica.com.ar');
  });

  it('cuenta los enlaces de WhatsApp e ignora el texto de los scripts', async () => {
    expect((await run('TRU-01', '<a href="https://wa.me/5492804551234">WhatsApp</a>')).status).toBe(
      'pass',
    );
    expect(
      (await run('TRU-01', `<body><script>var t="${PHONE}"</script><p>Hola</p></body>`)).status,
    ).toBe('fail');
  });

  it('falla sin medios de contacto', async () => {
    expect(await run('TRU-01', '<p>Bienvenidos</p>')).toMatchObject({
      status: 'fail',
      severity: 'high',
    });
  });
});

describe('TRU-02 a TRU-05', () => {
  it('TRU-02 formulario de contacto (los buscadores no cuentan)', async () => {
    expect(
      (await run('TRU-02', '<form><input type="email"><textarea></textarea></form>')).status,
    ).toBe('pass');
    expect((await run('TRU-02', '<form role="search"><input type="search"></form>')).status).toBe(
      'warn',
    );
  });

  it('TRU-03 política de privacidad', async () => {
    expect((await run('TRU-03', '<a href="/privacidad">Política de privacidad</a>')).status).toBe(
      'pass',
    );
    expect(
      (await run('TRU-03', '<a href="/legal">Protección de datos personales</a>')).status,
    ).toBe('pass');
    expect(await run('TRU-03', '<a href="/">Inicio</a>')).toMatchObject({
      status: 'fail',
      severity: 'medium',
    });
  });

  it('TRU-04 redes sociales', async () => {
    const f = await run(
      'TRU-04',
      '<a href="https://www.instagram.com/clinica">IG</a><a href="https://facebook.com/clinica">FB</a>',
    );
    expect(f.status).toBe('pass');
    expect(f.evidence).toMatch(/Instagram/);
    expect(f.evidence).not.toContain('clinica');
    expect((await run('TRU-04', '<p></p>')).status).toBe('warn');
  });

  it('TRU-05 datos del negocio (heurístico, con cautela)', async () => {
    const f = await run(
      'TRU-05',
      `<body><address>Av. Fontana 123, Trelew</address><p>${PHONE}</p></body>`,
    );
    expect(f.status).toBe('pass');
    expect(f.evidence).not.toContain('Fontana');
    const none = await run('TRU-05', '<p>Hola</p>');
    expect(none.status).toBe('warn');
    expect(none.title).toMatch(/verificalo/);
  });
});
