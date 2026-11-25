import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { MeDto } from './dto/me.dto.js';
import { ProfileDto } from './dto/profile.dto.js';
import { FollowsService } from './follows.service.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const queryBuilderMock = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };
  const repositoryMock = {
    findOneBy: vi.fn(),
    existsBy: vi.fn(),
    createQueryBuilder: vi.fn(() => queryBuilderMock),
    manager: {
      transaction: vi.fn((work: (manager: unknown) => Promise<unknown>) =>
        work(managerMock),
      ),
    },
    create: vi.fn((data: Partial<User>) => ({ ...data })),
    save: vi.fn((user: Partial<User>) =>
      Promise.resolve({ id: 'u1', ...user }),
    ),
  };
  const txRepositoryMock = {
    findOne: vi.fn(),
    save: vi.fn((user: Partial<User>) => Promise.resolve({ ...user })),
  };
  const managerMock = { getRepository: vi.fn(() => txRepositoryMock) };
  const attachmentsServiceMock = {
    storeImage: vi.fn(),
    replaceSingle: vi.fn(),
    removeFiles: vi.fn(),
    findUrl: vi.fn(),
  };
  const followsServiceMock = {
    follow: vi.fn(),
    unfollow: vi.fn(),
    isFollowing: vi.fn(),
    countFollowers: vi.fn(),
    countFollowing: vi.fn(),
  };
  let service: UsersService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repositoryMock },
        {
          provide: I18nService,
          useValue: { t: vi.fn((key: string) => key) },
        },
        { provide: AttachmentsService, useValue: attachmentsServiceMock },
        { provide: FollowsService, useValue: followsServiceMock },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('findById looks the user up by id', async () => {
    const user = { id: 'u1' };
    repositoryMock.findOneBy.mockResolvedValue(user);

    await expect(service.findById('u1')).resolves.toBe(user);
    expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('findById returns null for an unknown id', async () => {
    repositoryMock.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).resolves.toBeNull();
  });

  describe('active users', () => {
    it('findActiveById only matches active users', async () => {
      const user = { id: 'u1', active: true };
      repositoryMock.findOneBy.mockResolvedValue(user);

      await expect(service.findActiveById('u1')).resolves.toBe(user);
      expect(repositoryMock.findOneBy).toHaveBeenCalledWith({
        id: 'u1',
        active: true,
      });
    });

    it('getActiveUser returns the active user', async () => {
      const user = { id: 'u1', active: true };
      repositoryMock.findOneBy.mockResolvedValue(user);

      await expect(service.getActiveUser('u1')).resolves.toBe(user);
    });

    it('getActiveUser returns 401 when the user was deleted or deactivated', async () => {
      // findOneBy({ id, active: true }) finds nothing in both cases.
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.getActiveUser('u1')).rejects.toThrow(
        new UnauthorizedException('auth.UNAUTHORIZED'),
      );
    });
  });

  it.each([true, false])('existsByEmail returns %s', async (exists) => {
    repositoryMock.existsBy.mockResolvedValue(exists);

    await expect(service.existsByEmail('a@b.c')).resolves.toBe(exists);
    expect(repositoryMock.existsBy).toHaveBeenCalledWith({ email: 'a@b.c' });
  });

  it('findActiveByEmailWithPassword selects the hidden password of an active user', async () => {
    const user = { id: 'u1', password: 'hash' };
    queryBuilderMock.getOne.mockResolvedValue(user);

    await expect(service.findActiveByEmailWithPassword('a@b.c')).resolves.toBe(
      user,
    );
    expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
      'user.active = :active',
      { active: true },
    );
    expect(repositoryMock.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('user.password');
    // Parameterized, never string-concatenated.
    expect(queryBuilderMock.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'a@b.c',
    });
  });

  it('create stores the hash in the password column and saves the user', async () => {
    const saved = await service.create({
      email: 'a@b.c',
      passwordHash: '$2b$10$hash',
      name: 'A',
    });

    expect(repositoryMock.create).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: '$2b$10$hash',
      name: 'A',
    });
    expect(repositoryMock.save).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ id: 'u1', email: 'a@b.c' });
  });

  it('create propagates database errors', async () => {
    const error = new Error('db down');
    repositoryMock.save.mockRejectedValueOnce(error);

    await expect(
      service.create({ email: 'a@b.c', passwordHash: 'h', name: 'A' }),
    ).rejects.toBe(error);
  });

  describe('getMe', () => {
    it('returns the active user with the avatar url', async () => {
      const user = { id: 'u1', email: 'a@b.c', name: 'A', bio: 'hi' };
      repositoryMock.findOneBy.mockResolvedValue(user);
      attachmentsServiceMock.findUrl.mockResolvedValue('/attachments/a1');

      const me = await service.getMe('u1');

      expect(me).toBeInstanceOf(MeDto);
      expect(me).toMatchObject({
        id: 'u1',
        bio: 'hi',
        avatarUrl: '/attachments/a1',
      });
      expect(attachmentsServiceMock.findUrl).toHaveBeenCalledWith(
        { type: 'user', id: 'u1' },
        'avatar',
      );
    });

    it('is a 401 for a deactivated user', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.getMe('u1')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateMe', () => {
    const avatar = {
      originalname: 'me.png',
      mimetype: 'image/png',
      size: 3,
      buffer: Buffer.from('png'),
    };
    const stored = {
      id: 'a2',
      storageKey: 'a2.png',
      fileName: 'me.png',
      mimeType: 'image/png',
      size: 3,
    };

    beforeEach(() => {
      repositoryMock.findOneBy.mockResolvedValue({ id: 'u1', active: true });
      txRepositoryMock.findOne.mockResolvedValue({
        id: 'u1',
        name: 'Old',
        bio: 'old bio',
      });
      attachmentsServiceMock.findUrl.mockResolvedValue(null);
    });

    it('changes name and bio under a row lock, without touching attachments', async () => {
      const me = await service.updateMe('u1', { name: 'New', bio: 'new bio' });

      expect(txRepositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: 'u1', active: true },
        lock: { mode: 'pessimistic_write' },
      });
      expect(txRepositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New', bio: 'new bio' }),
      );
      expect(me).toMatchObject({ name: 'New', bio: 'new bio' });
      expect(attachmentsServiceMock.storeImage).not.toHaveBeenCalled();
      expect(attachmentsServiceMock.replaceSingle).not.toHaveBeenCalled();
    });

    it('keeps fields that are not sent and clears the bio on an empty value', async () => {
      const me = await service.updateMe('u1', { bio: '' });

      expect(me).toMatchObject({ name: 'Old', bio: null });
    });

    it('stores the avatar, replaces the attachment and deletes the old file after commit', async () => {
      attachmentsServiceMock.storeImage.mockResolvedValue(stored);
      attachmentsServiceMock.replaceSingle.mockResolvedValue({
        attachment: { id: 'a2' },
        removedKeys: ['a1.png'],
      });
      attachmentsServiceMock.findUrl.mockResolvedValue('/attachments/a2');

      const me = await service.updateMe('u1', {}, avatar);

      expect(attachmentsServiceMock.storeImage).toHaveBeenCalledWith(avatar);
      expect(attachmentsServiceMock.replaceSingle).toHaveBeenCalledWith(
        managerMock,
        { type: 'user', id: 'u1' },
        'avatar',
        stored,
      );
      expect(attachmentsServiceMock.removeFiles).toHaveBeenCalledTimes(1);
      expect(attachmentsServiceMock.removeFiles).toHaveBeenCalledWith([
        'a1.png',
      ]);
      expect(me.avatarUrl).toBe('/attachments/a2');
    });

    it('deletes the new file and keeps the old one when the transaction fails', async () => {
      const error = new Error('db down');
      attachmentsServiceMock.storeImage.mockResolvedValue(stored);
      attachmentsServiceMock.replaceSingle.mockRejectedValue(error);

      await expect(service.updateMe('u1', {}, avatar)).rejects.toBe(error);
      expect(attachmentsServiceMock.removeFiles).toHaveBeenCalledTimes(1);
      expect(attachmentsServiceMock.removeFiles).toHaveBeenCalledWith([
        'a2.png',
      ]);
    });

    it('does not store the avatar for a deactivated user', async () => {
      repositoryMock.findOneBy.mockResolvedValue(null);

      await expect(service.updateMe('u1', {}, avatar)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(attachmentsServiceMock.storeImage).not.toHaveBeenCalled();
    });

    it('propagates an invalid image without starting a transaction', async () => {
      const error = new BadRequestException('attachments.INVALID_IMAGE_TYPE');
      attachmentsServiceMock.storeImage.mockRejectedValue(error);

      await expect(service.updateMe('u1', {}, avatar)).rejects.toBe(error);
      expect(repositoryMock.manager.transaction).not.toHaveBeenCalled();
    });
  });

  describe('profiles and follows', () => {
    const viewer = { id: 'u1', name: 'Viewer', bio: null, active: true };
    const target = { id: 'u2', name: 'Target', bio: 'bio', active: true };

    beforeEach(() => {
      repositoryMock.findOneBy.mockImplementation(({ id }: { id: string }) =>
        Promise.resolve(
          ({ u1: viewer, u2: target } as Record<string, unknown>)[id] ?? null,
        ),
      );
      attachmentsServiceMock.findUrl.mockResolvedValue('/attachments/a2');
      followsServiceMock.countFollowers.mockResolvedValue(3);
      followsServiceMock.countFollowing.mockResolvedValue(4);
      followsServiceMock.isFollowing.mockResolvedValue(true);
    });

    it('getProfile returns the public profile seen by the viewer', async () => {
      const profile = await service.getProfile('u1', 'u2');

      expect(profile).toBeInstanceOf(ProfileDto);
      expect(profile).toEqual({
        id: 'u2',
        name: 'Target',
        bio: 'bio',
        avatarUrl: '/attachments/a2',
        followersCount: 3,
        followingCount: 4,
        following: true,
      });
      expect(followsServiceMock.isFollowing).toHaveBeenCalledWith('u1', 'u2');
    });

    it('getProfile is a 404 for an unknown or deactivated user', async () => {
      await expect(service.getProfile('u1', 'missing')).rejects.toThrow(
        new NotFoundException('users.USER_NOT_FOUND'),
      );
    });

    it('getProfile is a 401 for a deactivated viewer', async () => {
      await expect(service.getProfile('gone', 'u2')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('follow stores the relation and returns the profile', async () => {
      await expect(service.follow('u1', 'u2')).resolves.toMatchObject({
        id: 'u2',
        following: true,
      });
      expect(followsServiceMock.follow).toHaveBeenCalledWith('u1', 'u2');
    });

    it('unfollow removes the relation and returns the profile', async () => {
      followsServiceMock.isFollowing.mockResolvedValue(false);

      await expect(service.unfollow('u1', 'u2')).resolves.toMatchObject({
        id: 'u2',
        following: false,
      });
      expect(followsServiceMock.unfollow).toHaveBeenCalledWith('u1', 'u2');
    });

    it.each(['follow', 'unfollow'] as const)(
      '%s of oneself is a 400',
      async (action) => {
        await expect(service[action]('u1', 'u1')).rejects.toThrow(
          new BadRequestException('users.CANNOT_FOLLOW_YOURSELF'),
        );
        expect(followsServiceMock[action]).not.toHaveBeenCalled();
      },
    );

    it.each(['follow', 'unfollow'] as const)(
      '%s of an unknown user is a 404',
      async (action) => {
        await expect(service[action]('u1', 'missing')).rejects.toThrow(
          NotFoundException,
        );
        expect(followsServiceMock[action]).not.toHaveBeenCalled();
      },
    );
  });
});
