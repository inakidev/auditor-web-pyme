import { argon2id, hash, verify } from 'argon2';

/** Mínimos de OWASP para argon2id: 19 MiB, 2 pasadas, 1 hilo. */
export const ARGON2_MIN = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const ARGON2ID_PATTERN =
  /^\$argon2id\$v=19\$m=(\d{1,7}),t=(\d{1,3}),p=(\d{1,3})\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$/;

/** Hash ficticio (de bytes aleatorios descartados): iguala el tiempo cuando el correo no existe. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$6E01kAS5/QdaZquTLFEnWw$w2CDN3JLOaVFgUheYCtCiodHGSiczj3eeczpASqkc2k';

export function isAcceptableArgon2idHash(value: string): boolean {
  const match = ARGON2ID_PATTERN.exec(value);
  if (match === null) return false;
  const [m, t, p] = match.slice(1).map(Number) as [number, number, number];
  return m >= ARGON2_MIN.memoryCost && t >= ARGON2_MIN.timeCost && p >= ARGON2_MIN.parallelism;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, ...ARGON2_MIN });
}

/** Siempre ejecuta argon2: sin hash usa el ficticio y devuelve false. */
export async function verifyPassword(
  storedHash: string | null,
  password: string,
): Promise<boolean> {
  try {
    const ok = await verify(storedHash ?? DUMMY_HASH, password);
    return storedHash !== null && ok;
  } catch {
    return false;
  }
}

export class VerifierBusyError extends Error {
  override readonly name = 'VerifierBusyError';
}

/** Limita las verificaciones argon2 simultáneas (cada una usa ~19 MiB y CPU). */
export class VerifyLimiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly opts: { concurrency: number; maxWaiting: number }) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.opts.concurrency) {
      if (this.waiting.length >= this.opts.maxWaiting) throw new VerifierBusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      // El lugar pasa directo al siguiente: `active` no cambia.
      if (next === undefined) this.active--;
      else next();
    }
  }
}
