import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import {
  AUTH_THROTTLE_LIMIT_KEY,
  AUTH_THROTTLE_TTL_KEY,
  DEFAULT_AUTH_THROTTLE_LIMIT,
  DEFAULT_AUTH_THROTTLE_TTL,
} from '../config/app.config.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenService } from './token.service.js';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT, I18nService],
      useFactory: (config: ConfigService, redis: Redis, i18n: I18nService) => ({
        throttlers: [
          {
            ttl: seconds(
              Number(
                config.get<string>(AUTH_THROTTLE_TTL_KEY) ??
                  DEFAULT_AUTH_THROTTLE_TTL,
              ),
            ),
            limit: Number(
              config.get<string>(AUTH_THROTTLE_LIMIT_KEY) ??
                DEFAULT_AUTH_THROTTLE_LIMIT,
            ),
          },
        ],
        storage: new RedisThrottlerStorage(redis),
        errorMessage: () => i18n.t('auth.TOO_MANY_REQUESTS'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TokenBlacklistService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
