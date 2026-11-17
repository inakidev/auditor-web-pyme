import { BlockList, isIP } from 'node:net';

// IPv4: lista de bloqueo con todos los rangos no públicos (CLAUDE.md, regla 2).
const BLOCKED_IPV4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada (RFC 1918)
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incluye metadatos de la nube 169.254.169.254
  ['172.16.0.0', 12], // privada (RFC 1918)
  ['192.0.0.0', 24], // asignaciones de protocolo IETF
  ['192.0.2.0', 24], // documentación (TEST-NET-1)
  ['192.88.99.0', 24], // relay 6to4 (obsoleto)
  ['192.168.0.0', 16], // privada (RFC 1918)
  ['198.18.0.0', 15], // pruebas de rendimiento
  ['198.51.100.0', 24], // documentación (TEST-NET-2)
  ['203.0.113.0', 24], // documentación (TEST-NET-3)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada, incluye 255.255.255.255
];

// IPv6: solo se permite unicast global (2000::/3). Eso deja fuera ::, ::1, las IPv4 mapeadas
// (::ffff:0:0/96), NAT64 (64:ff9b::/96 y 64:ff9b:1::/48), fc00::/7, fe80::/10 y ff00::/8.
// Dentro de 2000::/3 se bloquean además los rangos especiales:
const BLOCKED_IPV6_IN_GLOBAL: readonly (readonly [string, number])[] = [
  ['2001::', 23], // asignaciones IETF, incluye Teredo 2001::/32
  ['2001:db8::', 32], // documentación
  ['2002::', 16], // 6to4
  ['3fff::', 20], // documentación (RFC 9637)
];

const blockedIpv4 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4) blockedIpv4.addSubnet(network, prefix, 'ipv4');

const globalUnicastIpv6 = new BlockList();
globalUnicastIpv6.addSubnet('2000::', 3, 'ipv6');

const blockedIpv6 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV6_IN_GLOBAL) {
  blockedIpv6.addSubnet(network, prefix, 'ipv6');
}

/** true solo si la IP es pública y se puede conectar a ella. */
export function isPublicIp(ip: string): boolean {
  switch (isIP(ip)) {
    case 4:
      return !blockedIpv4.check(ip, 'ipv4');
    case 6:
      return globalUnicastIpv6.check(ip, 'ipv6') && !blockedIpv6.check(ip, 'ipv6');
    default:
      return false;
  }
}

/**
 * Devuelve la IP si el host de la URL es un literal (IPv4 o IPv6 sin corchetes), o null si es un
 * nombre. El parser WHATWG de URL ya normalizó las formas decimal, octal y hexadecimal.
 */
export function ipLiteralOf(hostname: string): string | null {
  const bare =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return isIP(bare) === 0 ? null : bare;
}
