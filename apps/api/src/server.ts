import { runAudit } from '@auditor/scanner';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';

const config = loadConfig(process.env);
const db = openDatabase(config.databasePath);
const app = buildApp({
  db,
  logger: { level: config.logLevel },
  runAudit: (url) => runAudit(url, { contactUrl: config.contactUrl }),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      db.$client.close();
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
