import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  DEV_PUBLIC_ORIGIN,
  PLACEHOLDERS,
  PLACEHOLDER_CONTACT_URL,
  DEFAULT_LIMITS,
  loadConfig,
} from './config.js';

// Hash descartable de prueba (argon2id, m=19456, t=2, p=1): no protege nada real.
const TEST_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Pi6zYWVECLNCDMMLGma33A$YLqequuTcr5AbpbIRZtce5o14091HU2ThekWV60Y18Q';

const PROD = {
  NODE_ENV: 'production',
  AUDITOR_CONTACT_URL: 'https://agencia.example.com/contacto',
  ADMIN_EMAIL: 'consultor@agencia.example.com',
  ADMIN_PASSWORD_HASH: TEST_HASH,
  IP_HASH_SALT: 'x'.repeat(32),
  PUBLIC_ORIGIN: 'https://auditor.agencia.example.com',
  PORT: '10000',
};

describe('loadConfig', () => {
  it('usa valores por defecto en desarrollo', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      contactUrl: PLACEHOLDER_CONTACT_URL,
      databasePath: './data/auditor.db',
      auth: {
        admin: null,
        ipHashSalt: PLACEHOLDERS.IP_HASH_SALT,
        publicOrigin: DEV_PUBLIC_ORIGIN,
      },
      trustProxyHops: 0,
      logProxyChain: false,
      contactCaptureEnabled: true,
      demoNotice: true,
      limits: DEFAULT_LIMITS,
    });
  });

  it('en desarrollo los valores de relleno de .env.example equivalen a no configurar', () => {
    const config = loadConfig({ ...PLACEHOLDERS, AUDITOR_CONTACT_URL: PLACEHOLDER_CONTACT_URL });
    expect(config.auth.admin).toBeNull();
    expect(config.auth.ipHashSalt).toBe(PLACEHOLDERS.IP_HASH_SALT);
  });

  it('en producción acepta una configuración completa', () => {
    const config = loadConfig(PROD);
    expect(config.contactUrl).toBe(PROD.AUDITOR_CONTACT_URL);
    expect(config.auth).toEqual({
      admin: { email: PROD.ADMIN_EMAIL, passwordHash: TEST_HASH },
      ipHashSalt: PROD.IP_HASH_SALT,
      publicOrigin: PROD.PUBLIC_ORIGIN,
    });
  });

  it.each([
    'PORT',
    'AUDITOR_CONTACT_URL',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD_HASH',
    'IP_HASH_SALT',
    'PUBLIC_ORIGIN',
  ] as const)('en producción falla si falta %s', (name) => {
    const env = Object.fromEntries(Object.entries(PROD).filter(([key]) => key !== name));
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it.each(Object.keys(PLACEHOLDERS))('en producción rechaza el valor de relleno de %s', (name) => {
    const placeholder = PLACEHOLDERS[name as keyof typeof PLACEHOLDERS];
    expect(() => loadConfig({ ...PROD, [name]: placeholder })).toThrow(ConfigError);
  });

  it('en producción rechaza la URL de contacto de relleno', () => {
    expect(() => loadConfig({ ...PROD, AUDITOR_CONTACT_URL: PLACEHOLDER_CONTACT_URL })).toThrow(
      ConfigError,
    );
  });

  it.each([
    ['argon2i', TEST_HASH.replace('$argon2id$', '$argon2i$')],
    ['memoria baja', TEST_HASH.replace('m=19456', 'm=4096')],
    ['t=1', TEST_HASH.replace('t=2', 't=1')],
    ['texto cualquiera', 'no-es-un-hash'],
  ])('rechaza un ADMIN_PASSWORD_HASH inválido (%s) en cualquier entorno', (_name, hash) => {
    expect(() => loadConfig({ ...PROD, ADMIN_PASSWORD_HASH: hash })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ADMIN_EMAIL: 'a@agencia.example.com', ADMIN_PASSWORD_HASH: hash }),
    ).toThrow(ConfigError);
  });

  it('acepta parámetros de argon2id mayores a los mínimos', () => {
    const hash = TEST_HASH.replace('m=19456,t=2', 'm=65536,t=3');
    expect(loadConfig({ ...PROD, ADMIN_PASSWORD_HASH: hash }).auth.admin?.passwordHash).toBe(hash);
  });

  it('exige ADMIN_EMAIL y ADMIN_PASSWORD_HASH juntos', () => {
    expect(() => loadConfig({ ADMIN_PASSWORD_HASH: TEST_HASH })).toThrow(ConfigError);
    expect(() => loadConfig({ ADMIN_EMAIL: 'a@agencia.example.com' })).toThrow(ConfigError);
  });

  it('rechaza un ADMIN_EMAIL inválido', () => {
    expect(() => loadConfig({ ...PROD, ADMIN_EMAIL: 'no es correo' })).toThrow(ConfigError);
  });

  it('normaliza ADMIN_EMAIL a minúsculas', () => {
    const config = loadConfig({ ...PROD, ADMIN_EMAIL: ' Consultor@Agencia.Example.com ' });
    expect(config.auth.admin?.email).toBe('consultor@agencia.example.com');
  });

  it('exige IP_HASH_SALT de al menos 32 caracteres en cualquier entorno', () => {
    expect(() => loadConfig({ ...PROD, IP_HASH_SALT: 'x'.repeat(31) })).toThrow(ConfigError);
    expect(() => loadConfig({ IP_HASH_SALT: 'corta' })).toThrow(ConfigError);
  });

  it.each([
    'http://auditor.agencia.example.com',
    'https://auditor.agencia.example.com/',
    'https://auditor.agencia.example.com/panel',
    'no es una url',
  ])('en producción rechaza PUBLIC_ORIGIN=%s', (origin) => {
    expect(() => loadConfig({ ...PROD, PUBLIC_ORIGIN: origin })).toThrow(ConfigError);
  });

  it('en desarrollo acepta un PUBLIC_ORIGIN http sin barra final', () => {
    expect(loadConfig({ PUBLIC_ORIGIN: 'http://localhost:4000' }).auth.publicOrigin).toBe(
      'http://localhost:4000',
    );
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'http://localhost:4000/' })).toThrow(ConfigError);
  });

  it('rechaza una URL de contacto inválida', () => {
    expect(() => loadConfig({ AUDITOR_CONTACT_URL: 'no es una url' })).toThrow(ConfigError);
  });

  it.each(['0', '70000', 'abc'])('rechaza PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError);
  });

  it('en producción junta todas las variables que faltan en un solo mensaje', () => {
    const error = (() => {
      try {
        loadConfig({ NODE_ENV: 'production' });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    for (const name of [
      'PORT',
      'PUBLIC_ORIGIN',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD_HASH',
      'IP_HASH_SALT',
      'AUDITOR_CONTACT_URL',
    ]) {
      expect(message).toContain(name);
    }
  });

  it('explica si el hash trae comillas', () => {
    expect(() => loadConfig({ ...PROD, ADMIN_PASSWORD_HASH: `'${TEST_HASH}'` })).toThrow(
      /comillas/,
    );
  });

  it('explica si el hash parece haber perdido los $', () => {
    expect(() =>
      loadConfig({ ...PROD, ADMIN_PASSWORD_HASH: TEST_HASH.replaceAll('$', '') }),
    ).toThrow(/perdió los signos/);
    // Lo que deja un shell que expandió $argon2id, $v, etc. como variables vacías.
    expect(() => loadConfig({ ...PROD, ADMIN_PASSWORD_HASH: '=19=19456,t=2,p=1' })).toThrow(
      /perdió los signos/,
    );
  });

  it('en producción la captura de correos arranca apagada', () => {
    expect(loadConfig(PROD).contactCaptureEnabled).toBe(false);
    expect(loadConfig({ ...PROD, CONTACT_CAPTURE_ENABLED: 'true' }).contactCaptureEnabled).toBe(
      true,
    );
  });

  it('lee los límites, el proxy y el aviso de demo', () => {
    const config = loadConfig({
      ...PROD,
      TRUST_PROXY_HOPS: '1',
      LOG_PROXY_CHAIN: 'true',
      DEMO_NOTICE: 'false',
      AUDIT_LIMIT_PER_IP: '5',
      AUDIT_LIMIT_WINDOW_MINUTES: '10',
      DOMAIN_COOLDOWN_SECONDS: '0',
      DAILY_AUDIT_CAP: '50',
      AUDIT_CONCURRENCY: '1',
      AUDIT_MAX_PENDING: '3',
    });
    expect(config.trustProxyHops).toBe(1);
    expect(config.logProxyChain).toBe(true);
    expect(config.demoNotice).toBe(false);
    expect(config.limits).toEqual({
      perIp: 5,
      windowMinutes: 10,
      domainCooldownSeconds: 0,
      dailyCap: 50,
      concurrency: 1,
      maxPending: 3,
    });
  });

  it.each([
    ['TRUST_PROXY_HOPS', '4'],
    ['TRUST_PROXY_HOPS', '-1'],
    ['AUDIT_LIMIT_PER_IP', '0'],
    ['AUDIT_LIMIT_PER_IP', 'muchos'],
    ['AUDIT_CONCURRENCY', '9'],
    ['DAILY_AUDIT_CAP', '1.5'],
    ['CONTACT_CAPTURE_ENABLED', 'si'],
  ])('rechaza %s=%s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(ConfigError);
  });
});
