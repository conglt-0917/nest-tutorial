import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';

describe('ArticlesController', () => {
  const authUser: AuthUser = {
    id: 'u1',
    email: 'user@example.com',
    jti: 'jti-1',
    exp: 2,
  };
  const articlesServiceMock = {
    create: vi.fn(),
    list: vi.fn(),
    feed: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    favorite: vi.fn(),
    unfavorite: vi.fn(),
  };
  let controller: ArticlesController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [{ provide: ArticlesService, useValue: articlesServiceMock }],
    }).compile();
    controller = moduleRef.get(ArticlesController);
  });

  it('create passes the viewer and the three fields', async () => {
    const created = { slug: 's' };
    articlesServiceMock.create.mockResolvedValue(created);

    await expect(
      controller.create(authUser, {
        title: 't',
        description: 'd',
        body: 'b',
      }),
    ).resolves.toBe(created);
    expect(articlesServiceMock.create).toHaveBeenCalledWith('u1', {
      title: 't',
      description: 'd',
      body: 'b',
    });
  });

  it('list passes filters and pagination separately', async () => {
    const page = { articles: [], articlesCount: 0 };
    articlesServiceMock.list.mockResolvedValue(page);

    await expect(
      controller.list(authUser, {
        authorId: 'a',
        favoritedBy: 'f',
        limit: 5,
        offset: 10,
      }),
    ).resolves.toBe(page);
    expect(articlesServiceMock.list).toHaveBeenCalledWith(
      'u1',
      { authorId: 'a', favoritedBy: 'f' },
      { limit: 5, offset: 10 },
    );
  });

  it('feed passes the viewer and pagination', async () => {
    articlesServiceMock.feed.mockResolvedValue({});

    await controller.feed(authUser, { limit: 5, offset: 10 });

    expect(articlesServiceMock.feed).toHaveBeenCalledWith('u1', {
      limit: 5,
      offset: 10,
    });
  });

  it('get passes the viewer and the slug', async () => {
    articlesServiceMock.get.mockResolvedValue({});

    await controller.get(authUser, 'my-slug');

    expect(articlesServiceMock.get).toHaveBeenCalledWith('u1', 'my-slug');
  });

  it('update passes only the editable fields', async () => {
    articlesServiceMock.update.mockResolvedValue({});

    await controller.update(authUser, 'my-slug', { title: 'new' });

    expect(articlesServiceMock.update).toHaveBeenCalledWith('u1', 'my-slug', {
      title: 'new',
      description: undefined,
      body: undefined,
    });
  });

  it('remove delegates to the service', async () => {
    articlesServiceMock.remove.mockResolvedValue(undefined);

    await expect(
      controller.remove(authUser, 'my-slug'),
    ).resolves.toBeUndefined();
    expect(articlesServiceMock.remove).toHaveBeenCalledWith('u1', 'my-slug');
  });

  it('favorite and unfavorite delegate to the service', async () => {
    articlesServiceMock.favorite.mockResolvedValue({});
    articlesServiceMock.unfavorite.mockResolvedValue({});

    await controller.favorite(authUser, 'my-slug');
    await controller.unfavorite(authUser, 'my-slug');

    expect(articlesServiceMock.favorite).toHaveBeenCalledWith('u1', 'my-slug');
    expect(articlesServiceMock.unfavorite).toHaveBeenCalledWith(
      'u1',
      'my-slug',
    );
  });

  describe('route metadata', () => {
    const handlers = [
      'create',
      'list',
      'feed',
      'get',
      'update',
      'remove',
      'favorite',
      'unfavorite',
    ] as const;

    it.each(handlers)('%s is not public', (name) => {
      const handler = ArticlesController.prototype[name];

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    });

    it.each(handlers)('%s is never cached', (name) => {
      const headers = Reflect.getMetadata(
        HEADERS_METADATA,
        ArticlesController.prototype[name],
      ) as { name: string; value: string }[];

      expect(headers.map((header) => header.name)).toEqual(
        expect.arrayContaining(['Cache-Control', 'Pragma', 'Expires']),
      );
    });

    it('declares feed before the :slug route', () => {
      const names = Object.getOwnPropertyNames(ArticlesController.prototype);

      expect(names.indexOf('feed')).toBeLessThan(names.indexOf('get'));
    });
  });
});
