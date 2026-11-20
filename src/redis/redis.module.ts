import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import {
  DEFAULT_REDIS_HOST,
  DEFAULT_REDIS_PORT,
  REDIS_HOST_KEY,
  REDIS_PASSWORD_KEY,
  REDIS_PORT_KEY,
} from '../config/app.config.js';
import { REDIS_CLIENT } from './redis.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new Redis({
          host: configService.get<string>(REDIS_HOST_KEY) ?? DEFAULT_REDIS_HOST,
          port: Number(
            configService.get<string>(REDIS_PORT_KEY) ?? DEFAULT_REDIS_PORT,
          ),
          password: configService.get<string>(REDIS_PASSWORD_KEY) || undefined,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
