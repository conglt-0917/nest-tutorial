import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_REFRESH_EXPIRES_IN,
  JWT_ACCESS_EXPIRES_IN_KEY,
  JWT_ACCESS_SECRET_KEY,
  JWT_REFRESH_EXPIRES_IN_KEY,
  JWT_REFRESH_SECRET_KEY,
} from '../config/app.config.js';
import { TokenService } from './token.service.js';

const config: Record<string, string> = {
  [JWT_ACCESS_SECRET_KEY]: 'access-secret',
  [JWT_ACCESS_EXPIRES_IN_KEY]: '900',
  [JWT_REFRESH_SECRET_KEY]: 'refresh-secret',
  [JWT_REFRESH_EXPIRES_IN_KEY]: '604800',
};

describe('TokenService', () => {
  const user = { id: 'user-1', email: 'user@example.com' };
  let service: TokenService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => config[key],
            getOrThrow: (key: string) => config[key],
          },
        },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('issues an access and a refresh token with distinct jtis and expiries', async () => {
    const { accessToken, refreshToken } = await service.issuePair(user);

    const access = await service.verify(accessToken, 'access');
    const refresh = await service.verify(refreshToken, 'refresh');

    expect(access).toMatchObject({
      sub: user.id,
      email: user.email,
      type: 'access',
    });
    expect(refresh).toMatchObject({ sub: user.id, type: 'refresh' });
    expect(access!.jti).not.toBe(refresh!.jti);
    expect(access!.exp - access!.iat).toBe(900);
    expect(refresh!.exp - refresh!.iat).toBe(604800);
  });

  it('rejects a token used as the other type', async () => {
    const { accessToken, refreshToken } = await service.issuePair(user);

    await expect(service.verify(accessToken, 'refresh')).resolves.toBeNull();
    await expect(service.verify(refreshToken, 'access')).resolves.toBeNull();
  });

  it('checks the type claim even when the secret is right (defense in depth)', async () => {
    const jwtService = new JwtService();
    const sign = (type: string, secret: string) =>
      jwtService.signAsync(
        { sub: user.id, email: user.email, jti: 'x', type },
        { secret, expiresIn: 60 },
      );

    await expect(
      service.verify(await sign('refresh', 'access-secret'), 'access'),
    ).resolves.toBeNull();
    await expect(
      service.verify(await sign('access', 'refresh-secret'), 'refresh'),
    ).resolves.toBeNull();
    await expect(
      service.verify(await sign('admin', 'access-secret'), 'access'),
    ).resolves.toBeNull();
  });

  it('rejects malformed tokens', async () => {
    await expect(service.verify('not-a-jwt', 'access')).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const { accessToken } = await service.issuePair(user);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 901 * 1000);
    try {
      await expect(service.verify(accessToken, 'access')).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token signed with another secret (forged)', async () => {
    const forged = await new JwtService().signAsync(
      { sub: user.id, email: user.email, jti: 'x', type: 'access' },
      { secret: 'attacker-secret', expiresIn: 900 },
    );

    await expect(service.verify(forged, 'access')).resolves.toBeNull();
  });

  it('rejects a token whose payload was tampered with', async () => {
    const { accessToken } = await service.issuePair(user);
    const [header, , signature] = accessToken.split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'admin', type: 'access', jti: 'x' }),
    ).toString('base64url');

    await expect(
      service.verify(`${header}.${payload}.${signature}`, 'access'),
    ).resolves.toBeNull();
  });

  it('rejects a token signed with alg "none"', async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: user.id,
      type: 'access',
      jti: 'x',
      exp: Math.floor(Date.now() / 1000) + 900,
    })}.`;

    await expect(service.verify(unsigned, 'access')).resolves.toBeNull();
  });

  describe('configuration', () => {
    async function create(env: Record<string, string>) {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TokenService,
          JwtService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => env[key],
              getOrThrow: (key: string) => {
                if (env[key] === undefined) throw new Error(`${key} missing`);
                return env[key];
              },
            },
          },
        ],
      }).compile();
      return moduleRef.get(TokenService);
    }

    it('uses the default expiries when none are configured', async () => {
      const tokens = await create({
        [JWT_ACCESS_SECRET_KEY]: 'a',
        [JWT_REFRESH_SECRET_KEY]: 'r',
      });
      const { accessToken, refreshToken } = await tokens.issuePair(user);
      const access = await tokens.verify(accessToken, 'access');
      const refresh = await tokens.verify(refreshToken, 'refresh');

      expect(access!.exp - access!.iat).toBe(DEFAULT_JWT_ACCESS_EXPIRES_IN);
      expect(refresh!.exp - refresh!.iat).toBe(DEFAULT_JWT_REFRESH_EXPIRES_IN);
    });

    it.each([JWT_ACCESS_SECRET_KEY, JWT_REFRESH_SECRET_KEY])(
      'fails fast when %s is missing',
      async (missingKey) => {
        const env: Record<string, string> = {
          [JWT_ACCESS_SECRET_KEY]: 'a',
          [JWT_REFRESH_SECRET_KEY]: 'r',
        };
        delete env[missingKey];

        await expect(create(env)).rejects.toThrow(`${missingKey} missing`);
      },
    );
  });
});
