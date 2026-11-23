import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const KEY_PREFIX = 'auth:throttle:';

/**
 * Fixed-window counter with blocking, executed atomically in Redis.
 * KEYS: hits key, block key. ARGV: ttl ms, limit, block duration ms.
 * Returns: total hits, hits-window ms left, blocked (1/0), block ms left.
 */
const INCREMENT_SCRIPT = `
local blockMs = redis.call('PTTL', KEYS[2])
if blockMs > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockMs }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local windowMs = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, windowMs, 1, tonumber(ARGV[3]) }
end
return { hits, windowMs, 0, 0 }
`;

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

const COMMAND = 'authThrottleIncrement';

type ThrottleRedis = Redis & {
  [COMMAND](
    hitsKey: string,
    blockKey: string,
    ttlMs: number,
    limit: number,
    blockMs: number,
  ): Promise<[number, number, number, number]>;
};

/**
 * Rate-limit counters shared by every app instance (the default storage is
 * in-memory, so each instance and each restart would get a fresh budget).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: ThrottleRedis;

  constructor(redis: Redis) {
    // Registers a Lua command locally; ioredis sends it with EVALSHA (falling
    // back to loading the script once), so the script isn't re-sent per hit.
    redis.defineCommand(COMMAND, { numberOfKeys: 2, lua: INCREMENT_SCRIPT });
    this.redis = redis as ThrottleRedis;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${KEY_PREFIX}${throttlerName}:${key}`;
    const [totalHits, windowMs, blocked, blockMs] = await this.redis[COMMAND](
      hitsKey,
      `${hitsKey}:blocked`,
      ttl,
      limit,
      blockDuration,
    );

    return {
      totalHits,
      timeToExpire: toSeconds(windowMs),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(blockMs),
    };
  }
}
