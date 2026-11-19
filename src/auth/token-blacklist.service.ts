import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

const KEY_PREFIX = 'auth:blacklist:';

@Injectable()
export class TokenBlacklistService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async revoke(jti: string, exp: number): Promise<boolean> {
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    if (ttlSeconds <= 0) return false;
    const result = await this.redis.set(
      KEY_PREFIX + jti,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(KEY_PREFIX + jti)) === 1;
  }
}
