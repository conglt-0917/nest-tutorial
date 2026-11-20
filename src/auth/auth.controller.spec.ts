import { HttpStatus } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
} from '@nestjs/common/constants.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import type { AuthUser } from './interfaces/jwt-payload.interface.js';

const tokenPair = { accessToken: 'a', refreshToken: 'r' };
const NO_CACHE_HEADERS = [
  { name: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
  { name: 'Pragma', value: 'no-cache' },
  { name: 'Expires', value: '0' },
];

describe('AuthController', () => {
  const authServiceMock = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };
  let controller: AuthController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    })
      // Rate limiting is exercised in test/throttle.e2e-spec.ts.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AuthController);
  });

  describe('delegation to AuthService', () => {
    it('register', async () => {
      const dto = { email: 'a@b.c', password: 'Secret123!', name: 'A' };
      const user = { id: 'u1' };
      authServiceMock.register.mockResolvedValue(user);

      await expect(controller.register(dto)).resolves.toBe(user);
      expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    });

    it('login', async () => {
      const dto = { email: 'a@b.c', password: 'Secret123!' };
      authServiceMock.login.mockResolvedValue(tokenPair);

      await expect(controller.login(dto)).resolves.toBe(tokenPair);
      expect(authServiceMock.login).toHaveBeenCalledWith(dto);
    });

    it('refresh passes only the refresh token', async () => {
      authServiceMock.refresh.mockResolvedValue(tokenPair);

      await expect(controller.refresh({ refreshToken: 'rt' })).resolves.toBe(
        tokenPair,
      );
      expect(authServiceMock.refresh).toHaveBeenCalledWith('rt');
    });

    it('logout passes the authenticated user and the refresh token', async () => {
      const authUser: AuthUser = { id: 'u1', email: 'a@b.c', jti: 'j', exp: 1 };
      authServiceMock.logout.mockResolvedValue(undefined);

      await expect(
        controller.logout(authUser, { refreshToken: 'rt' }),
      ).resolves.toBeUndefined();
      expect(authServiceMock.logout).toHaveBeenCalledWith(authUser, 'rt');
    });

    it('propagates service errors', async () => {
      const error = new Error('boom');
      authServiceMock.login.mockRejectedValue(error);

      await expect(
        controller.login({ email: 'a@b.c', password: 'x' }),
      ).rejects.toBe(error);
    });
  });

  describe('route metadata', () => {
    const proto = AuthController.prototype;
    const meta = (key: string, handler: object): unknown =>
      Reflect.getMetadata(key, handler);

    it.each([
      ['register', proto.register, true],
      ['login', proto.login, true],
      ['refresh', proto.refresh, true],
      ['logout', proto.logout, undefined],
    ])('%s is public: %s', (_name, handler, expected) => {
      expect(meta(IS_PUBLIC_KEY, handler)).toBe(expected);
    });

    it('the controller itself is not public', () => {
      expect(meta(IS_PUBLIC_KEY, AuthController)).toBeUndefined();
    });

    it.each([
      ['login', proto.login, HttpStatus.OK],
      ['refresh', proto.refresh, HttpStatus.OK],
      ['logout', proto.logout, HttpStatus.NO_CONTENT],
    ])('%s responds with HTTP %i', (_name, handler, status) => {
      expect(meta(HTTP_CODE_METADATA, handler)).toBe(status);
    });

    it.each([
      ['login', proto.login],
      ['refresh', proto.refresh],
    ])('%s sends all anti-cache headers', (_name, handler) => {
      expect(meta(HEADERS_METADATA, handler)).toEqual(
        expect.arrayContaining(NO_CACHE_HEADERS),
      );
    });

    it('rate-limits every auth endpoint (brute-force protection)', () => {
      expect(meta(GUARDS_METADATA, AuthController)).toEqual(
        expect.arrayContaining([ThrottlerGuard]),
      );
    });
  });
});
