import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Favorite } from './favorite.entity.js';
import { FavoritesService } from './favorites.service.js';

describe('FavoritesService', () => {
  const queryBuilderMock = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn(),
  };
  const repositoryMock = {
    createQueryBuilder: vi.fn(() => queryBuilderMock),
    delete: vi.fn(),
    find: vi.fn(),
  };
  let service: FavoritesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: getRepositoryToken(Favorite), useValue: repositoryMock },
      ],
    }).compile();
    service = moduleRef.get(FavoritesService);
  });

  it('favorite inserts the relation and ignores duplicates', async () => {
    await service.favorite('u1', 'a1');

    expect(queryBuilderMock.values).toHaveBeenCalledWith({
      userId: 'u1',
      articleId: 'a1',
    });
    expect(queryBuilderMock.orIgnore).toHaveBeenCalled();
    expect(queryBuilderMock.execute).toHaveBeenCalled();
  });

  it('unfavorite deletes the relation', async () => {
    await service.unfavorite('u1', 'a1');

    expect(repositoryMock.delete).toHaveBeenCalledWith({
      userId: 'u1',
      articleId: 'a1',
    });
  });

  describe('countByArticleIds', () => {
    it('counts favorites of active users per article', async () => {
      queryBuilderMock.getRawMany.mockResolvedValue([
        { articleId: 'a1', count: '3' },
      ]);

      await expect(service.countByArticleIds(['a1', 'a2'])).resolves.toEqual(
        new Map([['a1', 3]]),
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'user.active = :active',
        { active: true },
      );
    });

    it('skips the query for no articles', async () => {
      await expect(service.countByArticleIds([])).resolves.toEqual(new Map());
      expect(repositoryMock.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findFavoritedIds', () => {
    it('returns the favorited article ids', async () => {
      repositoryMock.find.mockResolvedValue([{ articleId: 'a1' }]);

      await expect(
        service.findFavoritedIds('u1', ['a1', 'a2']),
      ).resolves.toEqual(new Set(['a1']));
    });

    it('skips the query for no articles', async () => {
      await expect(service.findFavoritedIds('u1', [])).resolves.toEqual(
        new Set(),
      );
      expect(repositoryMock.find).not.toHaveBeenCalled();
    });
  });
});
