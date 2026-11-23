import { z } from 'zod';
import { isAcceptableArgon2idHash } from './auth/passwords.js';

export interface AuthConfig {
  /** Primer usuario: solo se crea si no existe ninguno. null = no configurado (solo desarrollo). */
  readonly admin: { readonly email: string; readonly passwordHash: string } | null;
  readonly ipHashSalt: string;
  /** Origen exacto de la web para verificar Origin (nunca se deriva de Host). */
  readonly publicOrigin: string;
}

/** Topes de uso (RF-15). */
export interface UsageLimitsConfig {
  /** Auditorías por IP en cada período. */
  readonly perIp: number;
  readonly windowMinutes: number;
  /** Espera entre dos auditorías del mismo dominio (0 = sin espera). */
  readonly domainCooldownSeconds: number;
  /** Auditorías totales por día (corta a la medianoche de Buenos Aires). */
  readonly dailyCap: number;
  /** Auditorías simultáneas. */
  readonly concurrency: number;
  /** Tamaño de la cola de espera. */
  readonly maxPending: number;
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly contactUrl: string;
  readonly databasePath: string;
  readonly auth: AuthConfig;
  /** Saltos de proxy de confianza para tomar la IP de X-Forwarded-For (0 = conexión directa). */
  readonly trustProxyHops: number;
  /** Diagnóstico temporal: registra cuántas entradas trae X-Forwarded-For (nunca las IP). */
  readonly logProxyChain: boolean;
  /** Si se puede dejar el correo. En producción, apagado hasta publicar los textos legales. */
  readonly contactCaptureEnabled: boolean;
  readonly demoNotice: boolean;
  readonly limits: UsageLimitsConfig;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Valor de relleno para desarrollo y pruebas; nunca se acepta en producción. */
export const PLACEHOLDER_CONTACT_URL = 'https://example.invalid/contacto';

/** Valores de relleno de .env.example: en producción el arranque falla si aparecen. */
export const PLACEHOLDERS = {
  ADMIN_EMAIL: 'admin@example.invalid',
  ADMIN_PASSWORD_HASH: 'reemplazar-por-la-salida-de-pnpm-user-hash',
  IP_HASH_SALT: 'reemplazar-por-32-o-mas-caracteres-aleatorios',
  PUBLIC_ORIGIN: 'https://auditor.example.invalid',
} as const;

export const DEV_PUBLIC_ORIGIN = 'http://localhost:5173';
const MIN_SALT_LENGTH = 32;

/** Pensados para que alguien pruebe varias veces seguidas sin quedar bloqueado. */
export const DEFAULT_LIMITS: UsageLimitsConfig = {
  perIp: 20,
  windowMinutes: 60,
  domainCooldownSeconds: 30,
  dailyCap: 300,
  concurrency: 2,
  maxPending: 20,
};

const ENVS = ['development', 'test', 'production'] as const;
type Env = AppConfig['env'];

function parseEnv(value: string | undefined): Env {
  const env = value ?? 'development';
  if (!(ENVS as readonly string[]).includes(env)) {
    throw new ConfigError(`NODE_ENV inválido: ${env}`);
  }
  return env as Env;
}

function parseInteger(
  source: NodeJS.ProcessEnv,
  name: string,
  range: { min: number; max: number; fallback: number },
): number {
  const raw = source[name]?.trim();
  if (raw === undefined || raw === '') return range.fallback;
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw) || value < range.min || value > range.max) {
    throw new ConfigError(
      `${name} debe ser un entero entre ${String(range.min)} y ${String(range.max)}`,
    );
  }
  return value;
}

function parseBoolean(source: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = source[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ConfigError(`${name} debe ser true o false`);
}

function parsePort(source: NodeJS.ProcessEnv, env: Env): number {
  if (env === 'production' && (source['PORT'] ?? '').trim() === '') {
    throw new ConfigError('PORT es obligatoria en producción (Render la define sola)');
  }
  return parseInteger(source, 'PORT', { min: 1, max: 65535, fallback: 3000 });
}

function parseContactUrl(value: string | undefined, env: Env): string {
  if (value === undefined || value === '') {
    if (env === 'production') {
      throw new ConfigError('AUDITOR_CONTACT_URL es obligatoria en producción');
    }
    return PLACEHOLDER_CONTACT_URL;
  }
  if (!URL.canParse(value)) {
    throw new ConfigError('AUDITOR_CONTACT_URL no es una URL válida');
  }
  if (env === 'production' && value === PLACEHOLDER_CONTACT_URL) {
    throw new ConfigError('AUDITOR_CONTACT_URL no puede ser el valor de relleno en producción');
  }
  return value;
}

/** undefined si falta o es el relleno (fuera de producción); en producción ambos casos fallan. */
function readSetting(
  source: NodeJS.ProcessEnv,
  name: keyof typeof PLACEHOLDERS,
  env: Env,
): string | undefined {
  const value = source[name]?.trim();
  const missing = value === undefined || value === '';
  if (env === 'production') {
    if (missing) throw new ConfigError(`${name} es obligatoria en producción`);
    if (value === PLACEHOLDERS[name]) {
      throw new ConfigError(`${name} no puede ser el valor de relleno en producción`);
    }
  }
  return missing || value === PLACEHOLDERS[name] ? undefined : value;
}

/** Explica por qué un hash no tiene el formato PHC de argon2id, para corregirlo rápido. */
function hashProblem(value: string): string {
  const base =
    'ADMIN_PASSWORD_HASH debe ser un hash $argon2id$v=19$m=..,t=..,p=..$ con m>=19456, t>=2 y p>=1 (generalo con pnpm user:hash)';
  if (/^['"].*['"]$/.test(value)) {
    return `${base}. Parece que trae comillas: en el panel de Render pegalo sin comillas.`;
  }
  if ((value.match(/\$/g) ?? []).length < 5) {
    return `${base}. Parece que perdió los signos $: revisá el escapado (en .env, entre comillas simples; en el panel de Render, tal cual).`;
  }
  return base;
}

function parseAdmin(
  rawEmail: string | undefined,
  passwordHash: string | undefined,
): AuthConfig['admin'] {
  if (rawEmail === undefined && passwordHash === undefined) return null;
  if (rawEmail === undefined || passwordHash === undefined) {
    throw new ConfigError('ADMIN_EMAIL y ADMIN_PASSWORD_HASH van juntas');
  }
  const email = z.email().safeParse(rawEmail.toLowerCase());
  if (!email.success) throw new ConfigError('ADMIN_EMAIL no es un correo válido');
  if (!isAcceptableArgon2idHash(passwordHash)) throw new ConfigError(hashProblem(passwordHash));
  return { email: email.data, passwordHash };
}

function parseSalt(source: NodeJS.ProcessEnv, env: Env): string {
  const salt = readSetting(source, 'IP_HASH_SALT', env) ?? PLACEHOLDERS.IP_HASH_SALT;
  if (salt.length < MIN_SALT_LENGTH) {
    throw new ConfigError(`IP_HASH_SALT debe tener al menos ${String(MIN_SALT_LENGTH)} caracteres`);
  }
  return salt;
}

function parsePublicOrigin(source: NodeJS.ProcessEnv, env: Env): string {
  const origin = readSetting(source, 'PUBLIC_ORIGIN', env) ?? DEV_PUBLIC_ORIGIN;
  // El origen serializado no lleva ruta ni barra final: si difiere, la variable está mal.
  if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
    throw new ConfigError('PUBLIC_ORIGIN debe ser un origen como https://auditor.ejemplo.com');
  }
  if (env === 'production' && !origin.startsWith('https://')) {
    throw new ConfigError('PUBLIC_ORIGIN debe usar https en producción');
  }
  return origin;
}

function parseLimits(source: NodeJS.ProcessEnv): UsageLimitsConfig {
  const d = DEFAULT_LIMITS;
  return {
    perIp: parseInteger(source, 'AUDIT_LIMIT_PER_IP', { min: 1, max: 10_000, fallback: d.perIp }),
    windowMinutes: parseInteger(source, 'AUDIT_LIMIT_WINDOW_MINUTES', {
      min: 1,
      max: 1440,
      fallback: d.windowMinutes,
    }),
    domainCooldownSeconds: parseInteger(source, 'DOMAIN_COOLDOWN_SECONDS', {
      min: 0,
      max: 86_400,
      fallback: d.domainCooldownSeconds,
    }),
    dailyCap: parseInteger(source, 'DAILY_AUDIT_CAP', {
      min: 1,
      max: 100_000,
      fallback: d.dailyCap,
    }),
    concurrency: parseInteger(source, 'AUDIT_CONCURRENCY', {
      min: 1,
      max: 8,
      fallback: d.concurrency,
    }),
    maxPending: parseInteger(source, 'AUDIT_MAX_PENDING', {
      min: 1,
      max: 500,
      fallback: d.maxPending,
    }),
  };
}

/**
 * Lee y valida la configuración. Falla al arrancar si falta algo obligatorio, y junta todos los
 * problemas en un solo mensaje para corregirlos de una vez (útil en el panel de Render).
 */
export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const env = parseEnv(source['NODE_ENV']);
  const problems: string[] = [];
  const read = <T>(parse: () => T, fallback: T): T => {
    try {
      return parse();
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      problems.push(error.message);
      return fallback;
    }
  };

  const config: AppConfig = {
    env,
    host: source['HOST'] ?? '127.0.0.1',
    port: read(() => parsePort(source, env), 0),
    logLevel: source['LOG_LEVEL'] ?? 'info',
    contactUrl: read(() => parseContactUrl(source['AUDITOR_CONTACT_URL'], env), ''),
    databasePath: source['DATABASE_PATH'] ?? './data/auditor.db',
    auth: {
      admin: read(
        () =>
          parseAdmin(
            read(() => readSetting(source, 'ADMIN_EMAIL', env), undefined),
            read(() => readSetting(source, 'ADMIN_PASSWORD_HASH', env), undefined),
          ),
        null,
      ),
      ipHashSalt: read(() => parseSalt(source, env), ''),
      publicOrigin: read(() => parsePublicOrigin(source, env), ''),
    },
    trustProxyHops: read(
      () => parseInteger(source, 'TRUST_PROXY_HOPS', { min: 0, max: 3, fallback: 0 }),
      0,
    ),
    logProxyChain: read(() => parseBoolean(source, 'LOG_PROXY_CHAIN', false), false),
    contactCaptureEnabled: read(
      () => parseBoolean(source, 'CONTACT_CAPTURE_ENABLED', env !== 'production'),
      false,
    ),
    demoNotice: read(() => parseBoolean(source, 'DEMO_NOTICE', true), true),
    limits: read(() => parseLimits(source), DEFAULT_LIMITS),
  };

  if (problems.length > 0) {
    throw new ConfigError(
      `La configuración no es válida (NODE_ENV=${env}):\n${problems.map((p) => `- ${p}`).join('\n')}`,
    );
  }
  return config;
}
