import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { compare, hash } from 'bcryptjs';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type {
  AuthUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenService } from './token.service.js';

vi.mock('bcryptjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bcryptjs')>();
  return {
    ...actual,
    compare: vi.fn(actual.compare),
    hash: vi.fn(actual.hash),
  };
});

const PASSWORD = 'Secret123!';
const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const tokenPair = { accessToken: 'new-access', refreshToken: 'new-refresh' };
const refreshPayload: JwtPayload = {
  sub: user.id,
  email: user.email,
  jti: 'refresh-jti',
  type: 'refresh',
  iat: 1,
  exp: 2,
};

describe('AuthService', () => {
  const usersServiceMock = {
    existsByEmail: vi.fn(),
    create: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    findById: vi.fn(),
  };
  const tokenServiceMock = { issuePair: vi.fn(), verify: vi.fn() };
  const blacklistMock = { revoke: vi.fn() };
  const i18nMock = { t: vi.fn((key: string) => key) };
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    tokenServiceMock.issuePair.mockResolvedValue(tokenPair);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: TokenBlacklistService, useValue: blacklistMock },
        { provide: I18nService, useValue: i18nMock },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    const dto = { email: user.email, password: PASSWORD, name: user.name };

    it('hashes the password and creates the user', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(false);
      usersServiceMock.create.mockResolvedValue(user);

      await expect(service.register(dto)).resolves.toBe(user);

      const input = usersServiceMock.create.mock.calls[0][0];
      expect(input).toMatchObject({ email: user.email, name: user.name });
      expect(input.passwordHash).not.toBe(PASSWORD);
      expect(input.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('rejects an email that is already registered', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(true);

      await expect(service.register(dto)).rejects.toThrow(
        new ConflictException('auth.EMAIL_ALREADY_EXISTS'),
      );
      expect(usersServiceMock.create).not.toHaveBeenCalled();
    });

    it('maps a unique violation from a concurrent registration to 409', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(false);
      usersServiceMock.create.mockRejectedValue(
        new QueryFailedError('INSERT', [], { code: '23505' } as never),
      );

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token pair for valid credentials', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: passwordHash,
      });

      await expect(
        service.login({ email: user.email, password: PASSWORD }),
      ).resolves.toEqual(tokenPair);
      expect(tokenServiceMock.issuePair).toHaveBeenCalledWith(
        expect.objectContaining({ id: user.id, email: user.email }),
      );
    });

    it('rejects a wrong password', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: passwordHash,
      });

      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toThrow(new UnauthorizedException('auth.INVALID_CREDENTIALS'));
    });

    it('rejects an unknown email with the same error', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(new UnauthorizedException('auth.INVALID_CREDENTIALS'));
      expect(tokenServiceMock.issuePair).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('revokes the presented refresh token and issues a new pair', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);
      blacklistMock.revoke.mockResolvedValue(true);
      usersServiceMock.findById.mockResolvedValue(user);

      await expect(service.refresh('old-refresh')).resolves.toEqual(tokenPair);
      expect(tokenServiceMock.verify).toHaveBeenCalledWith(
        'old-refresh',
        'refresh',
      );
      expect(blacklistMock.revoke).toHaveBeenCalledWith('refresh-jti', 2);
    });

    it('rejects a refresh token that was already used (revoked)', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);
      blacklistMock.revoke.mockResolvedValue(false);

      await expect(service.refresh('old-refresh')).rejects.toThrow(
        new UnauthorizedException('auth.INVALID_REFRESH_TOKEN'),
      );
      expect(tokenServiceMock.issuePair).not.toHaveBeenCalled();
    });

    it('rejects an invalid refresh token', async () => {
      tokenServiceMock.verify.mockResolvedValue(null);

      await expect(service.refresh('garbage')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(blacklistMock.revoke).not.toHaveBeenCalled();
    });

    it('rejects when the user no longer exists', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);
      blacklistMock.revoke.mockResolvedValue(true);
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(service.refresh('old-refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      jti: 'access-jti',
      exp: 3,
    };

    it('revokes both the access token and the refresh token', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);

      await service.logout(authUser, 'refresh');

      expect(blacklistMock.revoke).toHaveBeenCalledWith('access-jti', 3);
      expect(blacklistMock.revoke).toHaveBeenCalledWith('refresh-jti', 2);
    });

    it("does not revoke another user's refresh token", async () => {
      tokenServiceMock.verify.mockResolvedValue({
        ...refreshPayload,
        sub: 'someone-else',
      });

      await service.logout(authUser, 'refresh');

      expect(blacklistMock.revoke).toHaveBeenCalledTimes(1);
      expect(blacklistMock.revoke).toHaveBeenCalledWith('access-jti', 3);
    });

    it('still revokes the access token when the refresh token is invalid', async () => {
      tokenServiceMock.verify.mockResolvedValue(null);

      await service.logout(authUser, 'garbage');

      expect(blacklistMock.revoke).toHaveBeenCalledTimes(1);
      expect(blacklistMock.revoke).toHaveBeenCalledWith('access-jti', 3);
    });
  });

  describe('edge cases', () => {
    it('register rethrows database errors other than a unique violation', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(false);
      const notNull = new QueryFailedError('INSERT', [], {
        code: '23502',
      } as never);
      usersServiceMock.create.mockRejectedValue(notNull);

      await expect(
        service.register({ email: user.email, password: PASSWORD, name: 'U' }),
      ).rejects.toBe(notNull);
    });

    it('register rethrows non-database errors unchanged', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(false);
      const error = new Error('connection lost');
      usersServiceMock.create.mockRejectedValue(error);

      await expect(
        service.register({ email: user.email, password: PASSWORD, name: 'U' }),
      ).rejects.toBe(error);
    });

    it('register never stores the plain-text password', async () => {
      usersServiceMock.existsByEmail.mockResolvedValue(false);
      usersServiceMock.create.mockResolvedValue(user);

      await service.register({
        email: user.email,
        password: PASSWORD,
        name: 'U',
      });

      const input = usersServiceMock.create.mock.calls[0][0];
      expect(JSON.stringify(input)).not.toContain(PASSWORD);
      await expect(compare(PASSWORD, input.passwordHash)).resolves.toBe(true);
    });

    it('login does bcrypt work even for an unknown email (no timing leak)', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(null);
      vi.mocked(compare).mockClear();

      await expect(
        service.login({ email: 'nobody@example.com', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);

      expect(compare).toHaveBeenCalledTimes(1);
      expect(vi.mocked(compare).mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
    });

    it('login computes the dummy hash only once', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(null);
      vi.mocked(hash).mockClear();

      for (let i = 0; i < 3; i++) {
        await expect(
          service.login({ email: 'nobody@example.com', password: PASSWORD }),
        ).rejects.toThrow(UnauthorizedException);
      }

      expect(hash).toHaveBeenCalledTimes(1);
    });

    it('refresh does not issue tokens when the user was deleted', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);
      blacklistMock.revoke.mockResolvedValue(true);
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(service.refresh('old-refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(tokenServiceMock.issuePair).not.toHaveBeenCalled();
    });

    it('refresh issues tokens for the user stored in the database', async () => {
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);
      blacklistMock.revoke.mockResolvedValue(true);
      const renamed = { ...user, email: 'renamed@example.com' };
      usersServiceMock.findById.mockResolvedValue(renamed);

      await service.refresh('old-refresh');

      expect(usersServiceMock.findById).toHaveBeenCalledWith(user.id);
      expect(tokenServiceMock.issuePair).toHaveBeenCalledWith(renamed);
    });

    it('logout still revokes the refresh token when the access token was already revoked', async () => {
      blacklistMock.revoke.mockResolvedValueOnce(false);
      tokenServiceMock.verify.mockResolvedValue(refreshPayload);

      await service.logout(
        { id: user.id, email: user.email, jti: 'access-jti', exp: 3 },
        'refresh',
      );

      expect(blacklistMock.revoke).toHaveBeenCalledWith('refresh-jti', 2);
    });

    it('logout verifies the token as a refresh token', async () => {
      tokenServiceMock.verify.mockResolvedValue(null);

      await service.logout(
        { id: user.id, email: user.email, jti: 'access-jti', exp: 3 },
        'some-token',
      );

      expect(tokenServiceMock.verify).toHaveBeenCalledWith(
        'some-token',
        'refresh',
      );
    });
  });
});
