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
  const usersServiceMock = {
    getMe: vi.fn(),
    updateMe: vi.fn(),
    getProfile: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  };
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
      usersServiceMock.getMe.mockResolvedValue(user);

      await expect(controller.getMe(authUser)).resolves.toBe(user);
      expect(usersServiceMock.getMe).toHaveBeenCalledWith('u1');
    });

    it('propagates the 401 for a deleted or deactivated user', async () => {
      const error = new UnauthorizedException('auth.UNAUTHORIZED');
      usersServiceMock.getMe.mockRejectedValue(error);

      await expect(controller.getMe(authUser)).rejects.toBe(error);
    });
  });

  describe('PATCH /users/me', () => {
    it('passes only name and bio, plus the uploaded avatar, to the service', async () => {
      const me = { id: 'u1' };
      const avatar = {
        originalname: 'me.png',
        mimetype: 'image/png',
        size: 3,
        buffer: Buffer.from('png'),
      };
      usersServiceMock.updateMe.mockResolvedValue(me);

      await expect(
        controller.updateMe(authUser, { name: 'New', bio: 'Bio' }, avatar),
      ).resolves.toBe(me);
      expect(usersServiceMock.updateMe).toHaveBeenCalledWith(
        'u1',
        { name: 'New', bio: 'Bio' },
        avatar,
      );
    });
  });

  describe('profiles and follows', () => {
    it.each(['getProfile', 'follow', 'unfollow'] as const)(
      '%s delegates with the viewer and target ids',
      async (method) => {
        const profile = { id: 'u2' };
        usersServiceMock[method].mockResolvedValue(profile);

        await expect(controller[method](authUser, 'u2')).resolves.toBe(profile);
        expect(usersServiceMock[method]).toHaveBeenCalledWith('u1', 'u2');
      },
    );
  });

  it.each(['getMe', 'updateMe', 'getProfile', 'follow', 'unfollow'] as const)(
    '%s is protected (not @Public) and never cached',
    (method) => {
      const handler = UsersController.prototype[method];

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
    },
  );
});
