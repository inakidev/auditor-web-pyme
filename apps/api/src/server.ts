import { fileURLToPath } from 'node:url';
import { runAudit } from '@auditor/scanner';
import { buildApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config.js';
import { openDatabase } from './db/client.js';

// Misma profundidad en src y dist: apunta a apps/web/dist (la web compilada).
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

let config: AppConfig;
try {
  config = loadConfig(process.env);
} catch (error) {
  // Mensaje claro y sin stack: es lo primero que se ve en los logs de Render.
  if (error instanceof ConfigError) {
    process.stderr.write(`No se puede arrancar.\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const db = openDatabase(config.databasePath);
const app = buildApp({
  db,
  logger: { level: config.logLevel },
  runAudit: (url, onPhase) => runAudit(url, { contactUrl: config.contactUrl, onPhase }),
  auth: config.auth,
  limits: config.limits,
  trustProxyHops: config.trustProxyHops,
  logProxyChain: config.logProxyChain,
  contactCaptureEnabled: config.contactCaptureEnabled,
  demoNotice: config.demoNotice,
  webDist: WEB_DIST,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'cerrando');
    void app.close().then(() => {
      db.$client.close();
      app.log.info('cerrado');
      process.exit(0);
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
