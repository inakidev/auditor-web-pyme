export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly contactUrl: string;
  readonly databasePath: string;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Valor de relleno para desarrollo y pruebas; nunca se acepta en producción. */
export const PLACEHOLDER_CONTACT_URL = 'https://example.invalid/contacto';

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
  };
}
