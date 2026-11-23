import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  REDIS_HOST_KEY,
  REDIS_PASSWORD_KEY,
  REDIS_PORT_KEY,
} from '../config/app.config.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisModule } from './redis.module.js';

const { RedisMock } = vi.hoisted(() => ({
  RedisMock: vi.fn(function (this: Record<string, unknown>, options: unknown) {
    this.options = options;
    this.quit = vi.fn().mockResolvedValue('OK');
  }),
}));
vi.mock('ioredis', () => ({ Redis: RedisMock }));

async function createModule(env: Record<string, string>) {
  const moduleRef = await Test.createTestingModule({ imports: [RedisModule] })
    .useMocker((token) =>
      token === ConfigService ? { get: (key: string) => env[key] } : undefined,
    )
    .compile();
  return moduleRef;
}

describe('RedisModule', () => {
  beforeEach(() => {
    RedisMock.mockClear();
  });

  it('builds the client from config', async () => {
    const moduleRef = await createModule({
      [REDIS_HOST_KEY]: 'cache.internal',
      [REDIS_PORT_KEY]: '6380',
      [REDIS_PASSWORD_KEY]: 'pw',
    });

    expect(moduleRef.get(REDIS_CLIENT).options).toEqual({
      host: 'cache.internal',
      port: 6380,
      password: 'pw',
    });
  });

  it('uses defaults and treats an empty password as "no auth"', async () => {
    const moduleRef = await createModule({ [REDIS_PASSWORD_KEY]: '' });

    expect(moduleRef.get(REDIS_CLIENT).options).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });

  it('closes the connection on application shutdown', async () => {
    const moduleRef = await createModule({});
    const client = moduleRef.get(REDIS_CLIENT);

    await moduleRef.close();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
