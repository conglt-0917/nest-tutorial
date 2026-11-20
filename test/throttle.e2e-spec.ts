import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, Like } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { REDIS_CLIENT } from './../src/redis/redis.constants.js';
import { User } from './../src/users/user.entity.js';

// Brute-force protection on /auth/*, with a low limit for this file only
// (vitest.config.e2e.ts raises it for the other suites).
const LIMIT = 3;
const RUN_ID = randomUUID().slice(0, 8);

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  const email = `e2e-${RUN_ID}-throttle@example.com`;
  const password = 'Secret123!';
  const server = () => app.getHttpServer();
  const login = (pwd: string, lang?: string) =>
    request(server())
      .post(lang ? `/auth/login?lang=${lang}` : '/auth/login')
      .send({ email, password: pwd });

  async function clearThrottleKeys() {
    const keys = await redis.keys('auth:throttle:*');
    if (keys.length) await redis.del(...keys);
  }

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = String(LIMIT);
    process.env.AUTH_THROTTLE_TTL = '60';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    redis = app.get(REDIS_CLIENT);
  });

  beforeEach(async () => {
    // Counters live in Redis and would otherwise carry over between tests/runs.
    await clearThrottleKeys();
  });

  afterAll(async () => {
    await clearThrottleKeys();
    await app
      .get(DataSource)
      .getRepository(User)
      .delete({
        email: Like(`e2e-${RUN_ID}-%`),
      });
    await app.close();
  });

  it(`blocks login after ${LIMIT} attempts, even with the right password`, async () => {
    await request(server())
      .post('/auth/register')
      .send({ email, password, name: 'Throttle' })
      .expect(201);

    for (let attempt = 1; attempt <= LIMIT; attempt++) {
      const res = await login('Wrong123!').expect(401);
      expect(res.headers['x-ratelimit-limit']).toBe(String(LIMIT));
      expect(res.headers['x-ratelimit-remaining']).toBe(
        String(LIMIT - attempt),
      );
    }

    const blocked = await login('Wrong123!').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toBe(
      'Too many requests, please try again later',
    );

    // A correct guess during the block must not get through.
    await login(password).expect(429);
  });

  it('translates the 429 message', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt++) {
      await login('Wrong123!');
    }

    const res = await login('Wrong123!', 'vi').expect(429);
    expect(res.body.message).toBe('Quá nhiều yêu cầu, vui lòng thử lại sau');
  });

  it('counts each endpoint separately', async () => {
    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      await login('Wrong123!');
    }
    await login(password).expect(429);

    // Refresh has its own budget, so it still answers normally (401 here).
    await request(server())
      .post('/auth/refresh')
      .send({
        refreshToken:
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl',
      })
      .expect(401);
  });

  it('allows the client again once the counters expire', async () => {
    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      await login('Wrong123!');
    }
    await login(password).expect(429);

    // Simulate the window and block passing.
    await clearThrottleKeys();

    await login(password).expect(200);
  });

  it('stores counters in Redis with an expiry (shared across instances)', async () => {
    await login('Wrong123!');

    const keys = await redis.keys('auth:throttle:*');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
    }
  });

  it('does not rate-limit routes outside /auth', async () => {
    for (let attempt = 0; attempt <= LIMIT + 2; attempt++) {
      await request(server()).get('/').expect(200);
    }
  });
});
