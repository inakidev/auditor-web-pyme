import { describe, expect, it } from 'vitest';
import { attemptKeys, normalizeIp, safeEqual, sessionCsrfToken } from './keys.js';

const SALT = 'sal-descartable-de-prueba-0123456789';

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:cb00:7107', '203.0.113.7'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
    ['2001:DB8:0001:0002:ffff::1', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['no-es-ip', 'no-es-ip'],
  ])('%s -> %s', (ip, expected) => {
    expect(normalizeIp(ip)).toBe(expected);
  });
});

describe('attemptKeys', () => {
  it('separa la clave correo+IP de la clave por IP y no expone ninguno de los dos datos', () => {
    const keys = attemptKeys(SALT, 'consultor@agencia.example.com', '203.0.113.7');
    expect(keys.pair).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.ip).toMatch(/^[0-9a-f]{64}$/);
    expect(keys.pair).not.toBe(keys.ip);
  });

  it('dos IPv6 del mismo /64 comparten contador', () => {
    const a = attemptKeys(SALT, 'x@agencia.example.com', '2001:db8:1:2::1');
    const b = attemptKeys(SALT, 'x@agencia.example.com', '2001:db8:1:2:ffff::9');
    expect(a).toEqual(b);
  });

  it('depende de la sal', () => {
    const a = attemptKeys(SALT, 'x@agencia.example.com', '203.0.113.7');
    const b = attemptKeys(`${SALT}-otra`, 'x@agencia.example.com', '203.0.113.7');
    expect(a.ip).not.toBe(b.ip);
  });
});

describe('safeEqual', () => {
  it('compara en tiempo constante y tolera largos distintos', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('sessionCsrfToken', () => {
  it('se deriva del id de sesión y cambia con él', () => {
    expect(sessionCsrfToken('sesion-a')).toBe(sessionCsrfToken('sesion-a'));
    expect(sessionCsrfToken('sesion-a')).not.toBe(sessionCsrfToken('sesion-b'));
    expect(sessionCsrfToken('sesion-a')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
