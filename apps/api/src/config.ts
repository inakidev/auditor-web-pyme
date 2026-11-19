import { z } from 'zod';
import { isAcceptableArgon2idHash } from './auth/passwords.js';

export interface AuthConfig {
  /** Primer usuario: solo se crea si no existe ninguno. null = no configurado (solo desarrollo). */
  readonly admin: { readonly email: string; readonly passwordHash: string } | null;
  readonly ipHashSalt: string;
  /** Origen exacto de la web para verificar Origin (nunca se deriva de Host). */
  readonly publicOrigin: string;
}

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly contactUrl: string;
  readonly databasePath: string;
  readonly auth: AuthConfig;
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

const ENVS = ['development', 'test', 'production'] as const;

function parseEnv(value: string | undefined): AppConfig['env'] {
  const env = value ?? 'development';
  if (!(ENVS as readonly string[]).includes(env)) {
    throw new ConfigError(`NODE_ENV inválido: ${env}`);
  }
  return env as AppConfig['env'];
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('PORT debe ser un entero entre 1 y 65535');
  }
  return port;
}

function parseContactUrl(value: string | undefined, env: AppConfig['env']): string {
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
  env: AppConfig['env'],
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

function parseAdmin(source: NodeJS.ProcessEnv, env: AppConfig['env']): AuthConfig['admin'] {
  const rawEmail = readSetting(source, 'ADMIN_EMAIL', env);
  const passwordHash = readSetting(source, 'ADMIN_PASSWORD_HASH', env);
  if (rawEmail === undefined && passwordHash === undefined) return null;
  if (rawEmail === undefined || passwordHash === undefined) {
    throw new ConfigError('ADMIN_EMAIL y ADMIN_PASSWORD_HASH van juntas');
  }
  const email = z.email().safeParse(rawEmail.toLowerCase());
  if (!email.success) throw new ConfigError('ADMIN_EMAIL no es un correo válido');
  if (!isAcceptableArgon2idHash(passwordHash)) {
    throw new ConfigError(
      'ADMIN_PASSWORD_HASH debe ser un $argon2id$ con m>=19456, t>=2 y p>=1 (generalo con pnpm user:hash)',
    );
  }
  return { email: email.data, passwordHash };
}

function parseSalt(source: NodeJS.ProcessEnv, env: AppConfig['env']): string {
  const salt = readSetting(source, 'IP_HASH_SALT', env) ?? PLACEHOLDERS.IP_HASH_SALT;
  if (salt.length < MIN_SALT_LENGTH) {
    throw new ConfigError(`IP_HASH_SALT debe tener al menos ${String(MIN_SALT_LENGTH)} caracteres`);
  }
  return salt;
}

function parsePublicOrigin(source: NodeJS.ProcessEnv, env: AppConfig['env']): string {
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

/** Lee y valida la configuración. Falla al arrancar si falta algo obligatorio. */
export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const env = parseEnv(source['NODE_ENV']);
  return {
    env,
    host: source['HOST'] ?? '127.0.0.1',
    port: parsePort(source['PORT']),
    logLevel: source['LOG_LEVEL'] ?? 'info',
    contactUrl: parseContactUrl(source['AUDITOR_CONTACT_URL'], env),
    databasePath: source['DATABASE_PATH'] ?? './data/auditor.db',
    auth: {
      admin: parseAdmin(source, env),
      ipHashSalt: parseSalt(source, env),
      publicOrigin: parsePublicOrigin(source, env),
    },
  };
}
