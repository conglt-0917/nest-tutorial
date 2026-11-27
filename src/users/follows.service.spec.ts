import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Follow } from './follow.entity.js';
import { FollowsService } from './follows.service.js';

describe('FollowsService', () => {
  const queryBuilderMock = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getCount: vi.fn(),
  };
  const repositoryMock = {
    createQueryBuilder: vi.fn(() => queryBuilderMock),
    delete: vi.fn(),
    existsBy: vi.fn(),
    find: vi.fn(),
  };
  let service: FollowsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: getRepositoryToken(Follow), useValue: repositoryMock },
      ],
    }).compile();
    service = moduleRef.get(FollowsService);
  });

  it('follow inserts the relation and ignores duplicates', async () => {
    await service.follow('u1', 'u2');

    expect(queryBuilderMock.values).toHaveBeenCalledWith({
      followerId: 'u1',
      followingId: 'u2',
    });
    expect(queryBuilderMock.orIgnore).toHaveBeenCalled();
    expect(queryBuilderMock.execute).toHaveBeenCalled();
  });

  it('unfollow deletes the relation', async () => {
    await service.unfollow('u1', 'u2');

    expect(repositoryMock.delete).toHaveBeenCalledWith({
      followerId: 'u1',
      followingId: 'u2',
    });
  });

  it('isFollowing checks the relation', async () => {
    repositoryMock.existsBy.mockResolvedValue(true);

    await expect(service.isFollowing('u1', 'u2')).resolves.toBe(true);
    expect(repositoryMock.existsBy).toHaveBeenCalledWith({
      followerId: 'u1',
      followingId: 'u2',
    });
  });

  it('countFollowers counts active followers of the user', async () => {
    queryBuilderMock.getCount.mockResolvedValue(2);

    await expect(service.countFollowers('u1')).resolves.toBe(2);
    expect(queryBuilderMock.where).toHaveBeenCalledWith(
      'follow.followingId = :userId',
      { userId: 'u1' },
    );
    expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
      'user.active = :active',
      { active: true },
    );
  });

  it('countFollowing counts active users the user follows', async () => {
    queryBuilderMock.getCount.mockResolvedValue(5);

    await expect(service.countFollowing('u1')).resolves.toBe(5);
    expect(queryBuilderMock.where).toHaveBeenCalledWith(
      'follow.followerId = :userId',
      { userId: 'u1' },
    );
  });

  describe('findFollowingIds', () => {
    it('returns the followed ids among the candidates', async () => {
      repositoryMock.find.mockResolvedValue([{ followingId: 'u2' }]);

      await expect(
        service.findFollowingIds('u1', ['u2', 'u3']),
      ).resolves.toEqual(new Set(['u2']));
      expect(repositoryMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ select: { followingId: true } }),
      );
    });

    it('skips the query for no candidates', async () => {
      await expect(service.findFollowingIds('u1', [])).resolves.toEqual(
        new Set(),
      );
      expect(repositoryMock.find).not.toHaveBeenCalled();
    });
  });
});
