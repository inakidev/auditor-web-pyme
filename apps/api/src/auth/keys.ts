import { createHmac, timingSafeEqual } from 'node:crypto';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Expande una IPv6 a 8 grupos numéricos; null si no tiene forma de IPv6. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0] ?? '';
  // Cola IPv4 embebida (::ffff:1.2.3.4) -> dos grupos hexadecimales.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail?.[1] !== undefined) {
    const [a = 0, b = 0, c = 0, d = 0] = tail[1].split('.').map(Number);
    text = `${text.slice(0, -tail[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) => (part ? part.split(':') : []);
  const head = parse(halves[0]);
  const rest = parse(halves[1]);
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const all = [...head, ...Array<string>(Math.max(fill, 0)).fill('0'), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/**
 * IPv4 tal cual; IPv4 mapeada -> IPv4; IPv6 -> su /64 (una conexión hogareña suele tener un /64
 * entero, así que contar por dirección exacta no frenaría a nadie).
 */
export function normalizeIp(ip: string): string {
  if (IPV4.test(ip)) return ip;
  const groups = ipv6Groups(ip);
  if (groups === null) return ip;
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (isMapped) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Claves de los contadores de intentos: nunca se guarda el correo ni la IP en claro. */
export function attemptKeys(salt: string, email: string, ip: string) {
  const net = normalizeIp(ip);
  return { pair: hmacHex(salt, `pair|${email}|${net}`), ip: hmacHex(salt, `ip|${net}`) };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

/** Token CSRF de la sesión: derivado del id en claro, que la base no conoce (solo su hash). */
export function sessionCsrfToken(sessionId: string): string {
  return createHmac('sha256', sessionId).update('csrf').digest('base64url');
}
