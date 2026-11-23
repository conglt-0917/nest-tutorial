import type { Redis } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage', () => {
  const redisMock = {
    defineCommand: vi.fn(),
    authThrottleIncrement: vi.fn(),
  };
  const run = redisMock.authThrottleIncrement;
  const storage = new RedisThrottlerStorage(redisMock as unknown as Redis);

  beforeEach(() => {
    run.mockReset();
  });

  it('registers the Lua script as a 2-key command once, at construction', () => {
    expect(redisMock.defineCommand).toHaveBeenCalledTimes(1);
    expect(redisMock.defineCommand).toHaveBeenCalledWith(
      'authThrottleIncrement',
      { numberOfKeys: 2, lua: expect.stringContaining('INCR') },
    );
  });

  it('runs the script with namespaced hit and block keys', async () => {
    run.mockResolvedValue([1, 60000, 0, 0]);

    await storage.increment('abc', 60000, 10, 30000, 'default');

    expect(run).toHaveBeenCalledWith(
      'auth:throttle:default:abc',
      'auth:throttle:default:abc:blocked',
      60000,
      10,
      30000,
    );
  });

  it('reports an allowed hit, converting milliseconds to whole seconds', async () => {
    run.mockResolvedValue([3, 41_200, 0, 0]);

    await expect(
      storage.increment('k', 60000, 10, 60000, 'default'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 42,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a blocked client with the remaining block time', async () => {
    run.mockResolvedValue([11, 59_000, 1, 60_000]);

    await expect(
      storage.increment('k', 60000, 10, 60000, 'default'),
    ).resolves.toEqual({
      totalHits: 11,
      timeToExpire: 59,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('never reports negative times (PTTL returns -1/-2 for missing keys)', async () => {
    run.mockResolvedValue([0, -2, 1, 500]);

    const record = await storage.increment('k', 60000, 10, 60000, 'default');

    expect(record.timeToExpire).toBe(0);
    expect(record.timeToBlockExpire).toBe(1);
  });

  it('propagates Redis errors instead of silently allowing requests', async () => {
    run.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      storage.increment('k', 60000, 10, 60000, 'default'),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
