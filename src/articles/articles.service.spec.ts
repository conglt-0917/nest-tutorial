import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { FollowsService } from '../users/follows.service.js';
import { UsersService } from '../users/users.service.js';
import { Article } from './article.entity.js';
import { ArticlesService } from './articles.service.js';
import { FavoritesService } from './favorites.service.js';

describe('ArticlesService', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const article = {
    id: 'a1',
    slug: 'hello-1a2b3c4d',
    title: 'Hello',
    description: 'Desc',
    body: 'Body',
    authorId: 'author',
    createdAt: now,
    updatedAt: now,
  } as Article;
  const author = { id: 'author', name: 'Writer', bio: 'Bio' };

  const queryBuilderMock = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
    getManyAndCount: vi.fn(),
  };
  const repositoryMock = {
    createQueryBuilder: vi.fn(() => queryBuilderMock),
    create: vi.fn((data: Partial<Article>) => ({ ...data })),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const usersServiceMock = {
    getActiveUser: vi.fn(),
    findActiveByIds: vi.fn(),
  };
  const favoritesServiceMock = {
    favorite: vi.fn(),
    unfavorite: vi.fn(),
    countByArticleIds: vi.fn(),
    findFavoritedIds: vi.fn(),
  };
  const followsServiceMock = { findFollowingIds: vi.fn() };
  const attachmentsServiceMock = { findUrls: vi.fn() };
  let service: ArticlesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    usersServiceMock.getActiveUser.mockResolvedValue({ id: 'viewer' });
    usersServiceMock.findActiveByIds.mockResolvedValue([author]);
    favoritesServiceMock.countByArticleIds.mockResolvedValue(new Map());
    favoritesServiceMock.findFavoritedIds.mockResolvedValue(new Set());
    followsServiceMock.findFollowingIds.mockResolvedValue(new Set());
    attachmentsServiceMock.findUrls.mockResolvedValue(new Map());
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: repositoryMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: FavoritesService, useValue: favoritesServiceMock },
        { provide: FollowsService, useValue: followsServiceMock },
        { provide: AttachmentsService, useValue: attachmentsServiceMock },
        { provide: I18nService, useValue: { t: vi.fn((key: string) => key) } },
      ],
    }).compile();
    service = moduleRef.get(ArticlesService);
  });

  it.each([
    [
      'create',
      () =>
        service.create('viewer', { title: 't', description: 'd', body: 'b' }),
    ],
    ['list', () => service.list('viewer', {}, { limit: 20, offset: 0 })],
    ['feed', () => service.feed('viewer', { limit: 20, offset: 0 })],
    ['get', () => service.get('viewer', 's')],
    ['update', () => service.update('viewer', 's', { title: 't' })],
    ['remove', () => service.remove('viewer', 's')],
    ['favorite', () => service.favorite('viewer', 's')],
    ['unfavorite', () => service.unfavorite('viewer', 's')],
  ])('%s rejects an inactive viewer with 401', async (_name, call) => {
    const error = new UnauthorizedException('auth.UNAUTHORIZED');
    usersServiceMock.getActiveUser.mockRejectedValue(error);

    await expect(call()).rejects.toBe(error);
    expect(repositoryMock.save).not.toHaveBeenCalled();
    expect(repositoryMock.update).not.toHaveBeenCalled();
    expect(repositoryMock.delete).not.toHaveBeenCalled();
  });

  describe('create', () => {
    const input = { title: 'Hello World', description: 'Desc', body: 'Body' };

    it('saves with a slug built from the title and returns the view', async () => {
      repositoryMock.save.mockResolvedValue(article);

      const result = await service.create('author', input);

      expect(repositoryMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ...input,
          authorId: 'author',
          slug: expect.stringMatching(/^hello-world-[0-9a-f]{8}$/) as string,
        }),
      );
      expect(result).toMatchObject({
        slug: article.slug,
        favorited: false,
        favoritesCount: 0,
        author: { id: 'author', name: 'Writer', following: false },
      });
    });

    it('retries with a new slug after a slug collision', async () => {
      const collision = new QueryFailedError('INSERT', [], {
        code: '23505',
      } as never);
      repositoryMock.save
        .mockRejectedValueOnce(collision)
        .mockResolvedValueOnce(article);

      await service.create('author', input);

      expect(repositoryMock.save).toHaveBeenCalledTimes(2);
      const slugs = repositoryMock.create.mock.calls.map(
        ([data]) => (data as { slug: string }).slug,
      );
      expect(slugs[0]).not.toBe(slugs[1]);
    });

    it('gives up after repeated collisions', async () => {
      const collision = new QueryFailedError('INSERT', [], {
        code: '23505',
      } as never);
      repositoryMock.save.mockRejectedValue(collision);

      await expect(service.create('author', input)).rejects.toBe(collision);
      expect(repositoryMock.save).toHaveBeenCalledTimes(3);
    });

    it('rethrows other errors immediately', async () => {
      const failure = new Error('db down');
      repositoryMock.save.mockRejectedValue(failure);

      await expect(service.create('author', input)).rejects.toBe(failure);
      expect(repositoryMock.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[article], 7]);
    });

    it('pages newest first and returns summaries without the body', async () => {
      favoritesServiceMock.countByArticleIds.mockResolvedValue(
        new Map([['a1', 2]]),
      );
      favoritesServiceMock.findFavoritedIds.mockResolvedValue(new Set(['a1']));
      followsServiceMock.findFollowingIds.mockResolvedValue(
        new Set(['author']),
      );
      attachmentsServiceMock.findUrls.mockResolvedValue(
        new Map([['author', '/attachments/x']]),
      );

      const result = await service.list('viewer', {}, { limit: 5, offset: 10 });

      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith(
        'article.createdAt',
        'DESC',
      );
      expect(queryBuilderMock.addOrderBy).toHaveBeenCalledWith(
        'article.id',
        'DESC',
      );
      expect(queryBuilderMock.offset).toHaveBeenCalledWith(10);
      expect(queryBuilderMock.limit).toHaveBeenCalledWith(5);
      expect(result.articlesCount).toBe(7);
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]).not.toHaveProperty('body');
      expect(result.articles[0]).toMatchObject({
        favorited: true,
        favoritesCount: 2,
        author: {
          following: true,
          avatarUrl: '/attachments/x',
        },
      });
    });

    it('looks up related data once for the whole page', async () => {
      const other = { ...article, id: 'a2', slug: 'other' } as Article;
      queryBuilderMock.getManyAndCount.mockResolvedValue([[article, other], 2]);

      await service.list('viewer', {}, { limit: 20, offset: 0 });

      expect(favoritesServiceMock.countByArticleIds).toHaveBeenCalledTimes(1);
      expect(favoritesServiceMock.countByArticleIds).toHaveBeenCalledWith([
        'a1',
        'a2',
      ]);
      expect(usersServiceMock.findActiveByIds).toHaveBeenCalledWith(['author']);
    });

    it('applies the author and favoritedBy filters', async () => {
      await service.list(
        'viewer',
        { authorId: 'author', favoritedBy: 'fan' },
        { limit: 20, offset: 0 },
      );

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'article.authorId = :authorId',
        { authorId: 'author' },
      );
      expect(queryBuilderMock.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        'favorite',
        expect.stringContaining('favorite.userId = :favoritedBy'),
        { favoritedBy: 'fan' },
      );
    });

    it('drops articles whose author is no longer active', async () => {
      usersServiceMock.findActiveByIds.mockResolvedValue([]);

      const result = await service.list('viewer', {}, { limit: 20, offset: 0 });

      expect(result.articles).toEqual([]);
    });
  });

  describe('feed', () => {
    it('joins the follows of the viewer', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.feed('viewer', { limit: 20, offset: 0 });

      expect(queryBuilderMock.innerJoin).toHaveBeenCalledWith(
        expect.anything(),
        'follow',
        expect.stringContaining('follow.followerId = :viewerId'),
        { viewerId: 'viewer' },
      );
      expect(result).toMatchObject({ articles: [], articlesCount: 0 });
    });
  });

  describe('get', () => {
    it('returns the article found by slug', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);

      const result = await service.get('viewer', article.slug);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'article.slug = :slug',
        { slug: article.slug },
      );
      expect(result).toMatchObject({ slug: article.slug, body: 'Body' });
    });

    it('is a 404 when the slug is unknown or the author is inactive', async () => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      await expect(service.get('viewer', 'missing')).rejects.toThrow(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );
    });
  });

  describe('update', () => {
    it('updates only the defined fields', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);
      repositoryMock.update.mockResolvedValue({ affected: 1 });

      await service.update('author', article.slug, {
        title: 'New',
        description: undefined,
        body: 'New body',
      });

      expect(repositoryMock.update).toHaveBeenCalledWith(
        { id: 'a1' },
        { title: 'New', body: 'New body' },
      );
    });

    it('does not touch the database when nothing changes', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);

      await service.update('author', article.slug, {});

      expect(repositoryMock.update).not.toHaveBeenCalled();
    });

    it('is a 403 for someone who is not the author', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);

      await expect(
        service.update('viewer', article.slug, { title: 'New' }),
      ).rejects.toThrow(new ForbiddenException('articles.NOT_ARTICLE_AUTHOR'));
      expect(repositoryMock.update).not.toHaveBeenCalled();
    });

    it('is a 404 when the article disappears before the update', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);
      repositoryMock.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.update('author', article.slug, { title: 'New' }),
      ).rejects.toThrow(new NotFoundException('articles.ARTICLE_NOT_FOUND'));
    });
  });

  describe('remove', () => {
    it('deletes the article of the author', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);

      await service.remove('author', article.slug);

      expect(repositoryMock.delete).toHaveBeenCalledWith({ id: 'a1' });
    });

    it('is a 403 for someone who is not the author', async () => {
      queryBuilderMock.getOne.mockResolvedValue(article);

      await expect(service.remove('viewer', article.slug)).rejects.toThrow(
        new ForbiddenException('articles.NOT_ARTICLE_AUTHOR'),
      );
      expect(repositoryMock.delete).not.toHaveBeenCalled();
    });

    it('is a 404 for an unknown slug', async () => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      await expect(service.remove('author', 'missing')).rejects.toThrow(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );
    });
  });

  describe('favorite and unfavorite', () => {
    beforeEach(() => {
      queryBuilderMock.getOne.mockResolvedValue(article);
    });

    it('favorite records the relation and returns the view', async () => {
      favoritesServiceMock.countByArticleIds.mockResolvedValue(
        new Map([['a1', 1]]),
      );
      favoritesServiceMock.findFavoritedIds.mockResolvedValue(new Set(['a1']));

      const result = await service.favorite('viewer', article.slug);

      expect(favoritesServiceMock.favorite).toHaveBeenCalledWith(
        'viewer',
        'a1',
      );
      expect(result).toMatchObject({ favorited: true, favoritesCount: 1 });
    });

    it('unfavorite removes the relation', async () => {
      await service.unfavorite('viewer', article.slug);

      expect(favoritesServiceMock.unfavorite).toHaveBeenCalledWith(
        'viewer',
        'a1',
      );
    });

    it.each([
      ['favorite', () => service.favorite('viewer', 'missing')],
      ['unfavorite', () => service.unfavorite('viewer', 'missing')],
    ])('%s is a 404 for an unknown slug', async (_name, call) => {
      queryBuilderMock.getOne.mockResolvedValue(null);

      await expect(call()).rejects.toThrow(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );
      expect(favoritesServiceMock.favorite).not.toHaveBeenCalled();
      expect(favoritesServiceMock.unfavorite).not.toHaveBeenCalled();
    });
  });
});
