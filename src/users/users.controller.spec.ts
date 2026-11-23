import { UnauthorizedException } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { Test, TestingModule } from '@nestjs/testing';
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
  const usersServiceMock = { getActiveUser: vi.fn() };
  let controller: UsersController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersServiceMock }],
    }).compile();
    controller = moduleRef.get(UsersController);
  });

  describe('GET /users/me', () => {
    it('returns the user identified by the access token', async () => {
      const user = { id: 'u1', email: 'user@example.com', name: 'User' };
      usersServiceMock.getActiveUser.mockResolvedValue(user);

      await expect(controller.getMe(authUser)).resolves.toBe(user);
      expect(usersServiceMock.getActiveUser).toHaveBeenCalledWith('u1');
    });

    it('propagates the 401 for a deleted or deactivated user', async () => {
      const error = new UnauthorizedException('auth.UNAUTHORIZED');
      usersServiceMock.getActiveUser.mockRejectedValue(error);

      await expect(controller.getMe(authUser)).rejects.toBe(error);
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
