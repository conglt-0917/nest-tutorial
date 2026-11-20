import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js';
import {
  DB_HOST_KEY,
  DB_NAME_KEY,
  DB_PASSWORD_KEY,
  DB_PORT_KEY,
  DB_USERNAME_KEY,
  DEFAULT_DB_HOST,
  DEFAULT_DB_PORT,
} from '../config/app.config.js';

export type EnvGetter = (key: string) => string | undefined;

export function buildDatabaseOptions(
  get: EnvGetter,
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    host: get(DB_HOST_KEY) ?? DEFAULT_DB_HOST,
    port: Number(get(DB_PORT_KEY) ?? DEFAULT_DB_PORT),
    username: get(DB_USERNAME_KEY),
    password: get(DB_PASSWORD_KEY),
    database: get(DB_NAME_KEY),
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'migrations',
  };
}
