import { domainToASCII } from 'node:url';

/**
 * Límites de uso de POST /api/audits (RF-15). Viven en memoria: la base de la demo es efímera y
 * un reinicio los vuelve a cero (documentado). Las IP llegan ya hasheadas (HMAC con sal).
 */
export interface UsageLimiterOptions {
  readonly perIp: number;
  readonly windowMinutes: number;
  readonly domainCooldownSeconds: number;
  readonly dailyCap: number;
  /** Tope de claves por mapa: acota la memoria. */
  readonly maxKeys: number;
}

export type LimitCode = 'RATE_LIMITED' | 'DOMAIN_COOLDOWN' | 'DAILY_CAP' | 'SERVICE_BUSY';
export type Verdict = { ok: true } | { ok: false; code: LimitCode; retryAfterMs: number };

export const MAX_LIMIT_KEYS = 10_000;
/** El tope diario corta a la medianoche de Buenos Aires (UTC-3, sin horario de verano). */
const BUENOS_AIRES_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Segundos enteros para Retry-After, siempre hacia arriba y al menos 1. */
export function retryAfterSeconds(ms: number): number {
  return Math.max(Math.ceil(ms / 1000), 1);
}

/** Minúsculas, sin punto final y en punycode: variantes del mismo host comparten clave. */
export function normalizeDomainKey(host: string): string {
  const trimmed = host.toLowerCase().replace(/\.+$/, '');
  return domainToASCII(trimmed) || trimmed;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Ventana fija por clave. Al llenarse descarta vencidas; nunca expulsa claves vigentes. */
class WindowCounter {
  private readonly entries = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  /** No modifica nada salvo descartar claves vencidas. */
  check(
    key: string,
    now: number,
  ): { ok: true } | { ok: false; full: boolean; retryAfterMs: number } {
    const entry = this.entries.get(key);
    if (entry !== undefined && entry.resetAt > now) {
      return entry.count < this.limit
        ? { ok: true }
        : { ok: false, full: false, retryAfterMs: entry.resetAt - now };
    }
    if (entry === undefined && this.entries.size >= this.maxKeys) {
      const soonest = this.sweep(now);
      if (this.entries.size >= this.maxKeys) {
        return { ok: false, full: true, retryAfterMs: soonest - now };
      }
    }
    return { ok: true };
  }

  consume(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (entry !== undefined && entry.resetAt > now) entry.count++;
    else this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  /** Borra las vencidas y devuelve cuándo vence la próxima vigente. */
  private sweep(now: number): number {
    let soonest = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
      else soonest = Math.min(soonest, entry.resetAt);
    }
    return soonest;
  }
}

function dayOf(now: number): number {
  return Math.floor((now + BUENOS_AIRES_OFFSET_MS) / DAY_MS);
}

export class UsageLimiter {
  private readonly perIp: WindowCounter;
  private readonly perDomain: WindowCounter | null;
  private daily = { day: -1, count: 0 };

  constructor(private readonly opts: UsageLimiterOptions) {
    this.perIp = new WindowCounter(opts.perIp, opts.windowMinutes * 60_000, opts.maxKeys);
    this.perDomain =
      opts.domainCooldownSeconds === 0
        ? null
        : new WindowCounter(1, opts.domainCooldownSeconds * 1000, opts.maxKeys);
  }

  /** Revisa todos los topes sin consumir nada: un pedido rechazado no gasta cupo. */
  check(input: { ipKey: string; domain: string }, now: number): Verdict {
    const ip = this.perIp.check(input.ipKey, now);
    if (!ip.ok) {
      return {
        ok: false,
        code: ip.full ? 'SERVICE_BUSY' : 'RATE_LIMITED',
        retryAfterMs: ip.retryAfterMs,
      };
    }
    const domain = this.perDomain?.check(normalizeDomainKey(input.domain), now) ?? { ok: true };
    if (!domain.ok) {
      return {
        ok: false,
        code: domain.full ? 'SERVICE_BUSY' : 'DOMAIN_COOLDOWN',
        retryAfterMs: domain.retryAfterMs,
      };
    }
    const today = dayOf(now);
    const used = this.daily.day === today ? this.daily.count : 0;
    if (used >= this.opts.dailyCap) {
      const nextMidnight = (today + 1) * DAY_MS - BUENOS_AIRES_OFFSET_MS;
      return { ok: false, code: 'DAILY_CAP', retryAfterMs: nextMidnight - now };
    }
    return { ok: true };
  }

  /** Consume el cupo; se llama solo si check dio ok y el pedido se aceptó. */
  commit(input: { ipKey: string; domain: string }, now: number): void {
    this.perIp.consume(input.ipKey, now);
    this.perDomain?.consume(normalizeDomainKey(input.domain), now);
    const today = dayOf(now);
    this.daily = { day: today, count: (this.daily.day === today ? this.daily.count : 0) + 1 };
  }
}
