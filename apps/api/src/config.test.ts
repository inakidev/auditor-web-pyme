import { describe, expect, it } from 'vitest';
import { ConfigError, PLACEHOLDER_CONTACT_URL, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('usa valores por defecto en desarrollo', () => {
    expect(loadConfig({})).toEqual({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      contactUrl: PLACEHOLDER_CONTACT_URL,
    });
  });

  it('en producción falla si falta AUDITOR_CONTACT_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
  });

  it('en producción rechaza el valor de relleno', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', AUDITOR_CONTACT_URL: PLACEHOLDER_CONTACT_URL }),
    ).toThrow(ConfigError);
  });

  it('en producción acepta una URL real', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      AUDITOR_CONTACT_URL: 'https://agencia.example.com/contacto',
    });
    expect(config.contactUrl).toBe('https://agencia.example.com/contacto');
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
});
