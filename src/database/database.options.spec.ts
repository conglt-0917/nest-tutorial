import {
  DB_HOST_KEY,
  DB_NAME_KEY,
  DB_PASSWORD_KEY,
  DB_PORT_KEY,
  DB_USERNAME_KEY,
} from '../config/app.config.js';
import { buildDatabaseOptions } from './database.options.js';

describe('buildDatabaseOptions', () => {
  it('maps env values to Postgres options', () => {
    const env: Record<string, string> = {
      [DB_HOST_KEY]: 'db.internal',
      [DB_PORT_KEY]: '6543',
      [DB_USERNAME_KEY]: 'app',
      [DB_PASSWORD_KEY]: 'pw',
      [DB_NAME_KEY]: 'appdb',
    };

    expect(buildDatabaseOptions((key) => env[key])).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      port: 6543,
      username: 'app',
      password: 'pw',
      database: 'appdb',
    });
  });

  it('falls back to localhost:5432', () => {
    const options = buildDatabaseOptions(() => undefined);

    expect(options.host).toBe('localhost');
    expect(options.port).toBe(5432);
  });

  it('never lets TypeORM change the schema on its own', () => {
    const options = buildDatabaseOptions(() => undefined);

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrationsTableName).toBe('migrations');
  });
});
