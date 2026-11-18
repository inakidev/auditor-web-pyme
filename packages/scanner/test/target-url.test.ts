import { describe, expect, it } from 'vitest';
import { normalizeTargetUrl } from '../src/net/target-url.js';

// Validación previa sin red (RF-01): normaliza lo que escribe la persona y rechaza lo que
// safeFetch rechazaría sin consultar DNS.

describe('normalizeTargetUrl', () => {
  it.each([
    ['ejemplo.com', 'https://ejemplo.com/'],
    ['  Ejemplo.COM  ', 'https://ejemplo.com/'],
    ['https://ejemplo.com', 'https://ejemplo.com/'],
    ['http://ejemplo.com/pagina?x=1#ancla', 'http://ejemplo.com/pagina?x=1'],
    ['www.ejemplo.com.ar/contacto', 'https://www.ejemplo.com.ar/contacto'],
    ['HTTPS://ejemplo.com:443/', 'https://ejemplo.com/'],
    ['8.8.8.8', 'https://8.8.8.8/'],
  ])('acepta %s → %s', (input, expected) => {
    expect(normalizeTargetUrl(input)).toEqual({
      ok: true,
      url: expected,
      domain: new URL(expected).hostname,
    });
  });

  it.each([
    ['', 'INVALID_URL'],
    ['no es una url', 'INVALID_URL'],
    ['ftp://ejemplo.com', 'BLOCKED_SCHEME'],
    ['file:///etc/passwd', 'BLOCKED_SCHEME'],
    ['ejemplo.com:8080', 'BLOCKED_PORT'],
    ['user:pass@ejemplo.com', 'CREDENTIALS_IN_URL'],
    ['localhost', 'BLOCKED_HOST'],
    ['intranet', 'BLOCKED_HOST'],
    ['127.0.0.1', 'BLOCKED_IP'],
    ['0x7f000001', 'BLOCKED_IP'],
    ['[::1]', 'BLOCKED_IP'],
    ['169.254.169.254', 'BLOCKED_IP'],
    [`ejemplo.com/${'a'.repeat(2100)}`, 'INVALID_URL'],
  ])('rechaza %s → %s', (input, code) => {
    expect(normalizeTargetUrl(input)).toEqual({ ok: false, code });
  });
});
