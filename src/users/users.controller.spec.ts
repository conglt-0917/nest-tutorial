import { UnauthorizedException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  const authUser: AuthUser = {
    id: 'u1',
    email: 'user@example.com',
    jti: 'jti-1',
    exp: 2,
  };
  const usersServiceMock = { findById: vi.fn() };
  const i18nMock = { t: vi.fn((key: string) => key) };
  let controller: UsersController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        { provide: I18nService, useValue: i18nMock },
      ],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  describe('GET /users/me', () => {
    it('returns the user identified by the access token', async () => {
      const user = { id: 'u1', email: 'user@example.com', name: 'User' };
      usersServiceMock.findById.mockResolvedValue(user);

      await expect(controller.getMe(authUser)).resolves.toBe(user);
      expect(usersServiceMock.findById).toHaveBeenCalledWith('u1');
    });

    it('returns 401 when the token is valid but the user was deleted', async () => {
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(controller.getMe(authUser)).rejects.toThrow(
        new UnauthorizedException('auth.UNAUTHORIZED'),
      );
    });

    it('is protected (not @Public) and never cached', () => {
      const handler = UsersController.prototype.getMe;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, UsersController),
      ).toBeUndefined();
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
        expect.arrayContaining([
          {
            name: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          { name: 'Pragma', value: 'no-cache' },
          { name: 'Expires', value: '0' },
        ]),
      );
    });
  });
});
