import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, Like, Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import type { JwtPayload } from './../src/auth/interfaces/jwt-payload.interface.js';
import {
  JWT_ACCESS_SECRET_KEY,
  JWT_REFRESH_SECRET_KEY,
} from './../src/config/app.config.js';
import { REDIS_CLIENT } from './../src/redis/redis.constants.js';
import { User } from './../src/users/user.entity.js';

const RUN_ID = randomUUID().slice(0, 8);
const PASSWORD = 'Secret123!';

interface Session {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let config: ConfigService;
  let redis: Redis;
  let users: Repository<User>;
  let counter = 0;

  const server = () => app.getHttpServer();
  const uniqueEmail = (label = 'user') =>
    `e2e-${RUN_ID}-${label}-${++counter}@example.com`;
  const decode = (token: string) => jwt.decode<JwtPayload>(token);
  const getMe = (token: string) =>
    request(server()).get('/users/me').set('Authorization', `Bearer ${token}`);

  async function register(email = uniqueEmail(), password = PASSWORD) {
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password, name: 'E2E User' })
      .expect(201);
    return res.body as { id: string; email: string };
  }

  async function login(email: string, password = PASSWORD) {
    const res = await request(server())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  async function newSession(label?: string): Promise<Session> {
    const { id, email } = await register(uniqueEmail(label));
    return { id, email, ...(await login(email)) };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    redis = app.get(REDIS_CLIENT);
    users = app.get(DataSource).getRepository(User);
  });

  afterAll(async () => {
    await users.delete({ email: Like(`e2e-${RUN_ID}-%`) });
    await app.close();
  });

  it('full flow: register → login → me → refresh → logout', async () => {
    const email = uniqueEmail('flow');
    const registered = await register(email);
    const { accessToken, refreshToken } = await login(email);

    const me = await getMe(accessToken).expect(200);
    expect(me.body).toMatchObject({ id: registered.id, email });

    const refreshed = await request(server())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const next = refreshed.body as Session;

    await request(server())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${next.accessToken}`)
      .send({ refreshToken: next.refreshToken })
      .expect(204);

    await getMe(next.accessToken).expect(401);
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: next.refreshToken })
      .expect(401);
  });

  describe('POST /auth/register', () => {
    it('creates the user, normalizes input and never returns the password', async () => {
      const email = uniqueEmail('normalize');
      const res = await request(server())
        .post('/auth/register')
        .send({
          email: `  ${email.toUpperCase()} `,
          password: PASSWORD,
          name: '  Ann  ',
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email,
        name: 'Ann',
        bio: null,
        active: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('stores a bcrypt hash, not the plain-text password', async () => {
      const { email } = await register();
      const row = await users
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email })
        .getOneOrFail();

      expect(row.password).not.toBe(PASSWORD);
      expect(row.password).toMatch(/^\$2[aby]\$10\$/);
    });

    it('ignores client-supplied id and timestamps (mass assignment)', async () => {
      const forcedId = randomUUID();
      const res = await request(server())
        .post('/auth/register')
        .send({
          email: uniqueEmail('mass'),
          password: PASSWORD,
          name: 'Mass',
          id: forcedId,
          createdAt: '2000-01-01T00:00:00.000Z',
        })
        .expect(201);

      expect(res.body.id).not.toBe(forcedId);
      expect(res.body.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    });

    it('rejects a duplicate email, case-insensitively (409, translated)', async () => {
      const { email } = await register();

      const en = await request(server())
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, name: 'Dup' })
        .expect(409);
      expect(en.body.message).toBe('Email is already registered');

      const vi = await request(server())
        .post('/auth/register?lang=vi')
        .send({ email, password: PASSWORD, name: 'Dup' })
        .expect(409);
      expect(vi.body.message).toBe('Email đã được đăng ký');
    });

    it('lets exactly one of two concurrent registrations win', async () => {
      const email = uniqueEmail('race');
      const send = () =>
        request(server())
          .post('/auth/register')
          .send({ email, password: PASSWORD, name: 'Race' });

      const statuses = (await Promise.all([send(), send(), send()]))
        .map((res) => res.status)
        .sort();

      expect(statuses).toEqual([201, 409, 409]);
    });

    it('accepts a 72-character password (bcrypt limit) that can log in', async () => {
      const password = 'p'.repeat(72);
      const { email } = await register(uniqueEmail('long-pw'), password);

      await login(email, password);
    });

    it.each([
      ['an empty body', {}, ['email is invalid', 'password must be a string']],
      ['a malformed email', { email: 'nope' }, ['email is invalid']],
      [
        'a short password',
        { password: 'short' },
        ['password must be at least 8 characters'],
      ],
      [
        'a 73-character password',
        { password: 'p'.repeat(73) },
        ['password must be at most 72 characters'],
      ],
      ['an empty name', { name: '   ' }, ['name cannot be empty']],
      [
        'a 101-character name',
        { name: 'n'.repeat(101) },
        ['name must be at most 100 characters'],
      ],
      [
        'a non-string password',
        { password: 12345678 },
        ['password must be a string'],
      ],
    ])('returns 400 for %s', async (_label, override, messages) => {
      const body = Object.keys(override).length
        ? {
            email: uniqueEmail('invalid'),
            password: PASSWORD,
            name: 'N',
            ...override,
          }
        : {};

      const res = await request(server())
        .post('/auth/register')
        .send(body)
        .expect(400);

      expect(res.body.message).toEqual(expect.arrayContaining(messages));
    });

    it('translates validation errors (vi)', async () => {
      const res = await request(server())
        .post('/auth/register?lang=vi')
        .send({ email: 'not-an-email', password: 'short', name: '' })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'email không hợp lệ',
          'mật khẩu phải có ít nhất 8 ký tự',
          'tên không được để trống',
        ]),
      );
    });

    it('never echoes the submitted password in validation errors', async () => {
      const secret = 'Short1!';
      const res = await request(server())
        .post('/auth/register')
        .send({ email: uniqueEmail('echo'), password: secret, name: 'N' })
        .expect(400);

      expect(JSON.stringify(res.body)).not.toContain(secret);
    });
  });

  describe('POST /auth/login', () => {
    it('returns two distinct JWTs and is not cacheable', async () => {
      const { email } = await register();

      const res = await request(server())
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200)
        .expect('Cache-Control', 'no-store, no-cache, must-revalidate')
        .expect('Pragma', 'no-cache')
        .expect('Expires', '0');

      const { accessToken, refreshToken } = res.body;
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
      expect(decode(accessToken).type).toBe('access');
      expect(decode(refreshToken).type).toBe('refresh');
      expect(decode(accessToken).jti).not.toBe(decode(refreshToken).jti);
    });

    it('accepts the email in any case and with surrounding spaces', async () => {
      const { email } = await register();

      await login(`  ${email.toUpperCase()}  `);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const { email } = await register();

      const wrongPassword = await request(server())
        .post('/auth/login')
        .send({ email, password: 'Wrong123!' })
        .expect(401);
      const unknownEmail = await request(server())
        .post('/auth/login')
        .send({ email: uniqueEmail('ghost'), password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.message).toBe('Email or password is incorrect');
    });

    it('translates the 401 (vi)', async () => {
      const res = await request(server())
        .post('/auth/login')
        .set('Accept-Language', 'vi')
        .send({ email: uniqueEmail('ghost'), password: PASSWORD })
        .expect(401);

      expect(res.body.message).toBe('Email hoặc mật khẩu không đúng');
    });

    it('returns 400 when credentials are missing', async () => {
      await request(server()).post('/auth/login').send({}).expect(400);
    });

    it('allows several concurrent sessions for the same user', async () => {
      const { email } = await register();
      const first = await login(email);
      const second = await login(email);

      await getMe(first.accessToken).expect(200);
      await getMe(second.accessToken).expect(200);
    });
  });

  describe('deactivated users', () => {
    async function deactivatedSession(): Promise<Session> {
      const session = await newSession('inactive');
      await users.update({ id: session.id }, { active: false });
      return session;
    }

    it('cannot log in, with the same error as a wrong password', async () => {
      const session = await deactivatedSession();

      const res = await request(server())
        .post('/auth/login')
        .send({ email: session.email, password: PASSWORD })
        .expect(401);
      expect(res.body.message).toBe('Email or password is incorrect');
    });

    it('cannot use an access token issued before deactivation on /users/me', async () => {
      const session = await deactivatedSession();

      await getMe(session.accessToken).expect(401);
    });

    it('cannot refresh with a refresh token issued before deactivation', async () => {
      const session = await deactivatedSession();

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('cannot be registered again with the same email', async () => {
      const session = await deactivatedSession();

      await request(server())
        .post('/auth/register')
        .send({ email: session.email, password: PASSWORD, name: 'Again' })
        .expect(409);
    });

    it('regains access when reactivated', async () => {
      const session = await deactivatedSession();
      await users.update({ id: session.id }, { active: true });

      await getMe(session.accessToken).expect(200);
      await login(session.email);
    });
  });

  describe('GET /users/me', () => {
    it('returns the current user without the password and is not cacheable', async () => {
      const session = await newSession('me');

      const res = await getMe(session.accessToken)
        .expect(200)
        .expect('Cache-Control', 'no-store, no-cache, must-revalidate')
        .expect('Pragma', 'no-cache')
        .expect('Expires', '0');

      expect(res.body).toMatchObject({ id: session.id, email: session.email });
      expect(res.body).not.toHaveProperty('password');
    });

    it('returns 401 without an Authorization header', async () => {
      await request(server()).get('/users/me').expect(401);
    });

    it.each([
      ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
      ['an empty Bearer token', 'Bearer '],
      ['a garbage token', 'Bearer not.a.jwt'],
    ])('returns 401 for %s', async (_label, header) => {
      await request(server())
        .get('/users/me')
        .set('Authorization', header)
        .expect(401);
    });

    it('returns 401 for a refresh token used as an access token', async () => {
      const session = await newSession();

      await getMe(session.refreshToken).expect(401);
    });

    it('returns 401 for a tampered token', async () => {
      const session = await newSession();
      const [header, , signature] = session.accessToken.split('.');
      const payload = Buffer.from(
        JSON.stringify({ ...decode(session.accessToken), sub: randomUUID() }),
      ).toString('base64url');

      await getMe(`${header}.${payload}.${signature}`).expect(401);
    });

    it('returns 401 for a token signed with the wrong secret', async () => {
      const session = await newSession();
      const forged = await jwt.signAsync(
        {
          sub: session.id,
          email: session.email,
          jti: randomUUID(),
          type: 'access',
        },
        { secret: config.get<string>(JWT_REFRESH_SECRET_KEY), expiresIn: 60 },
      );

      await getMe(forged).expect(401);
    });

    it('returns 401 for a token with the right secret but a non-access type', async () => {
      const session = await newSession();
      const wrongType = await jwt.signAsync(
        {
          sub: session.id,
          email: session.email,
          jti: randomUUID(),
          type: 'refresh',
        },
        { secret: config.get<string>(JWT_ACCESS_SECRET_KEY), expiresIn: 60 },
      );

      await getMe(wrongType).expect(401);
    });

    it('returns 401 for an expired token', async () => {
      const session = await newSession();
      const expired = await jwt.signAsync(
        {
          sub: session.id,
          email: session.email,
          jti: randomUUID(),
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        { secret: config.get<string>(JWT_ACCESS_SECRET_KEY) },
      );

      await getMe(expired).expect(401);
    });

    it('returns 401 when the user was deleted after the token was issued', async () => {
      const session = await newSession('deleted');
      await users.delete({ id: session.id });

      await getMe(session.accessToken).expect(401);
    });

    it('translates the 401 (x-custom-lang: vi)', async () => {
      const res = await request(server())
        .get('/users/me')
        .set('x-custom-lang', 'vi')
        .expect(401);

      expect(res.body.message).toBe(
        'Access token bị thiếu, không hợp lệ hoặc đã bị thu hồi',
      );
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a new, working token pair and is not cacheable', async () => {
      const session = await newSession();

      const res = await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200)
        .expect('Cache-Control', 'no-store, no-cache, must-revalidate')
        .expect('Pragma', 'no-cache')
        .expect('Expires', '0');

      expect(res.body.accessToken).not.toBe(session.accessToken);
      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      await getMe(res.body.accessToken).expect(200);
    });

    it('rejects reuse of a rotated refresh token', async () => {
      const session = await newSession();
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      const res = await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(res.body.message).toBe(
        'Refresh token is invalid, expired or revoked',
      );
    });

    it('lets exactly one of several concurrent refreshes with the same token win', async () => {
      const session = await newSession('refresh-race');
      const send = () =>
        request(server())
          .post('/auth/refresh')
          .send({ refreshToken: session.refreshToken });

      const statuses = (
        await Promise.all([send(), send(), send(), send(), send()])
      )
        .map((res) => res.status)
        .sort();

      expect(statuses).toEqual([200, 401, 401, 401, 401]);
    });

    it('rejects an access token passed as the refresh token', async () => {
      const session = await newSession();

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.accessToken })
        .expect(401);
    });

    it('rejects a refresh token whose user was deleted', async () => {
      const session = await newSession('deleted');
      await users.delete({ id: session.id });

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it.each([
      ['missing', {}],
      ['not a JWT', { refreshToken: 'abc' }],
    ])('returns 400 when the refresh token is %s', async (_label, body) => {
      await request(server()).post('/auth/refresh').send(body).expect(400);
    });

    it('only rotates the refresh token: the old access token stays valid until it expires', async () => {
      const session = await newSession();
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      await getMe(session.accessToken).expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    const logout = (accessToken: string, refreshToken: unknown) =>
      request(server())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(refreshToken === undefined ? {} : { refreshToken });

    it('blacklists both tokens in Redis with a TTL equal to their remaining lifetime', async () => {
      const session = await newSession();
      await logout(session.accessToken, session.refreshToken).expect(204);

      const now = Math.floor(Date.now() / 1000);
      for (const token of [session.accessToken, session.refreshToken]) {
        const { jti, exp } = decode(token);
        const ttl = await redis.ttl(`auth:blacklist:${jti}`);
        expect(ttl).toBeGreaterThan(0);
        expect(Math.abs(ttl - (exp - now))).toBeLessThanOrEqual(2);
      }

      await getMe(session.accessToken).expect(401);
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('requires a valid access token', async () => {
      const session = await newSession();

      await request(server())
        .post('/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      await logout(session.refreshToken, session.refreshToken).expect(401);
    });

    it('returns 401 when the same access token logs out twice', async () => {
      const session = await newSession();
      await logout(session.accessToken, session.refreshToken).expect(204);

      await logout(session.accessToken, session.refreshToken).expect(401);
    });

    it('returns 400 without a refresh token and does not revoke anything', async () => {
      const session = await newSession();

      await logout(session.accessToken, undefined).expect(400);
      await getMe(session.accessToken).expect(200);
    });

    it('still logs out when the refresh token is forged', async () => {
      const session = await newSession();
      const forged = await jwt.signAsync(
        { sub: session.id, jti: randomUUID(), type: 'refresh' },
        { secret: 'attacker-secret', expiresIn: 60 },
      );

      await logout(session.accessToken, forged).expect(204);
      await getMe(session.accessToken).expect(401);
      // The real refresh token was not part of the logout, so it still works.
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
    });

    it("cannot revoke another user's refresh token", async () => {
      const attacker = await newSession('attacker');
      const victim = await newSession('victim');

      await logout(attacker.accessToken, victim.refreshToken).expect(204);

      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: victim.refreshToken })
        .expect(200);
    });

    it('only ends the current session', async () => {
      const { email } = await register();
      const sessionA = await login(email);
      const sessionB = await login(email);

      await logout(sessionA.accessToken, sessionA.refreshToken).expect(204);

      await getMe(sessionA.accessToken).expect(401);
      await getMe(sessionB.accessToken).expect(200);
      await request(server())
        .post('/auth/refresh')
        .send({ refreshToken: sessionB.refreshToken })
        .expect(200);
    });
  });
});
