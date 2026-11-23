import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { DataSource } from 'typeorm';
import { ENV_FILE_PATHS } from '../config/app.config.js';
import { buildDatabaseOptions } from './database.options.js';

for (const envFile of ENV_FILE_PATHS) {
  if (!existsSync(envFile)) continue;
  const parsed = parseEnv(readFileSync(envFile, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value;
  }
}

export default new DataSource({
  ...buildDatabaseOptions((key) => process.env[key]),
  entities: [join(import.meta.dirname, '../**/*.entity.js')],
  migrations: [join(import.meta.dirname, 'migrations/*.js')],
});
