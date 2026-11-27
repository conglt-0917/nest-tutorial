import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, Like, Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { User } from './../src/users/user.entity.js';

const RUN_ID = randomUUID().slice(0, 8);
const PASSWORD = 'Secret123!';

interface Session {
  id: string;
  token: string;
}

interface ArticleBody {
  slug: string;
  title: string;
  description: string;
  body: string;
  favorited: boolean;
  favoritesCount: number;
  author: { id: string; following: boolean };
}

interface ListBody {
  articles: ArticleBody[];
  articlesCount: number;
}

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let users: Repository<User>;
  let counter = 0;

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function newSession(name = 'E2E Author'): Promise<Session> {
    const email = `e2e-${RUN_ID}-articles-${++counter}@example.com`;
    const registered = await request(server())
      .post('/auth/register')
      .send({ email, password: PASSWORD, name })
      .expect(201);
    const loggedIn = await request(server())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return {
      id: (registered.body as { id: string }).id,
      token: (loggedIn.body as { accessToken: string }).accessToken,
    };
  }

  async function createArticle(
    session: Session,
    title = 'How to train your dragon',
  ): Promise<ArticleBody> {
    const response = await request(server())
      .post('/articles')
      .set(auth(session.token))
      .send({ title, description: 'Ever wonder how?', body: 'Believe' })
      .expect(201);
    return response.body as ArticleBody;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    users = app.get(DataSource).getRepository(User);
  });

  afterAll(async () => {
    await users.delete({ email: Like(`e2e-${RUN_ID}-%`) });
    await app.close();
  });

  describe('authentication', () => {
    it.each([
      ['post', '/articles'],
      ['get', '/articles'],
      ['get', '/articles/feed'],
      ['get', '/articles/some-slug'],
      ['patch', '/articles/some-slug'],
      ['delete', '/articles/some-slug'],
      ['post', '/articles/some-slug/favorite'],
      ['delete', '/articles/some-slug/favorite'],
    ] as const)('%s %s requires a token', async (method, path) => {
      await request(server())[method](path).expect(401);
    });
  });

  describe('POST /articles', () => {
    it('creates an article with a slug derived from the title', async () => {
      const author = await newSession();

      const article = await createArticle(author, '  Học NestJS  ');

      expect(article).toMatchObject({
        title: 'Học NestJS',
        description: 'Ever wonder how?',
        body: 'Believe',
        favorited: false,
        favoritesCount: 0,
        author: { id: author.id, following: false },
      });
      expect(article.slug).toMatch(/^hoc-nestjs-[0-9a-f]{8}$/);
    });

    it('gives two articles with the same title different slugs', async () => {
      const author = await newSession();

      const first = await createArticle(author);
      const second = await createArticle(author);

      expect(first.slug).not.toBe(second.slug);
    });

    it('rejects missing or empty fields with translated messages', async () => {
      const author = await newSession();

      const english = await request(server())
        .post('/articles')
        .set(auth(author.token))
        .send({ title: '   ', description: 'd' })
        .expect(400);
      expect(JSON.stringify(english.body)).toContain('title cannot be empty');
      expect(JSON.stringify(english.body)).toContain('body');

      const vietnamese = await request(server())
        .post('/articles?lang=vi')
        .set(auth(author.token))
        .send({ title: '   ', description: 'd', body: 'b' })
        .expect(400);
      expect(JSON.stringify(vietnamese.body)).toContain(
        'tiêu đề không được để trống',
      );
    });

    it('rejects a title longer than 255 characters', async () => {
      const author = await newSession();

      await request(server())
        .post('/articles')
        .set(auth(author.token))
        .send({ title: 'a'.repeat(256), description: 'd', body: 'b' })
        .expect(400);
    });
  });

  describe('GET /articles/:slug', () => {
    it('returns the article with the author and viewer flags', async () => {
      const author = await newSession('Writer');
      const reader = await newSession();
      const created = await createArticle(author);
      await request(server())
        .post(`/users/${author.id}/follow`)
        .set(auth(reader.token))
        .expect(200);

      const response = await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(reader.token))
        .expect(200);

      expect(response.body).toMatchObject({
        slug: created.slug,
        body: 'Believe',
        author: { id: author.id, name: 'Writer', following: true },
      });
    });

    it('returns 404 for an unknown slug, translated on request', async () => {
      const reader = await newSession();

      const english = await request(server())
        .get('/articles/missing-slug')
        .set(auth(reader.token))
        .expect(404);
      expect((english.body as { message: string }).message).toBe(
        'Article not found',
      );

      const vietnamese = await request(server())
        .get('/articles/missing-slug?lang=vi')
        .set(auth(reader.token))
        .expect(404);
      expect((vietnamese.body as { message: string }).message).toBe(
        'Không tìm thấy bài viết',
      );
    });

    it('hides the article when its author is deactivated', async () => {
      const author = await newSession();
      const reader = await newSession();
      const created = await createArticle(author);

      await users.update({ id: author.id }, { active: false });

      await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(reader.token))
        .expect(404);
    });
  });

  describe('GET /articles', () => {
    it('lists newest first without the body, with pagination', async () => {
      const author = await newSession();
      const reader = await newSession();
      const first = await createArticle(author, 'First');
      const second = await createArticle(author, 'Second');
      const third = await createArticle(author, 'Third');

      const page = await request(server())
        .get(`/articles?authorId=${author.id}&limit=2&offset=0`)
        .set(auth(reader.token))
        .expect(200);
      const list = page.body as ListBody;

      expect(list.articlesCount).toBe(3);
      expect(list.articles.map((a) => a.slug)).toEqual([
        third.slug,
        second.slug,
      ]);
      expect(list.articles[0]).not.toHaveProperty('body');

      const rest = await request(server())
        .get(`/articles?authorId=${author.id}&limit=2&offset=2`)
        .set(auth(reader.token))
        .expect(200);
      expect((rest.body as ListBody).articles.map((a) => a.slug)).toEqual([
        first.slug,
      ]);
    });

    it('filters by favoritedBy and reports the favorited flag', async () => {
      const author = await newSession();
      const fan = await newSession();
      const liked = await createArticle(author, 'Liked');
      await createArticle(author, 'Ignored');
      await request(server())
        .post(`/articles/${liked.slug}/favorite`)
        .set(auth(fan.token))
        .expect(200);

      const response = await request(server())
        .get(`/articles?favoritedBy=${fan.id}`)
        .set(auth(fan.token))
        .expect(200);
      const list = response.body as ListBody;

      expect(list.articlesCount).toBe(1);
      expect(list.articles[0]).toMatchObject({
        slug: liked.slug,
        favorited: true,
        favoritesCount: 1,
      });
    });

    it('excludes articles of deactivated authors', async () => {
      const author = await newSession();
      const reader = await newSession();
      await createArticle(author);
      await users.update({ id: author.id }, { active: false });

      const response = await request(server())
        .get(`/articles?authorId=${author.id}`)
        .set(auth(reader.token))
        .expect(200);

      expect(response.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it.each([
      ['limit=0'],
      ['limit=101'],
      ['limit=abc'],
      ['offset=-1'],
      ['authorId=not-a-uuid'],
      ['favoritedBy=not-a-uuid'],
    ])('rejects invalid query %s', async (query) => {
      const reader = await newSession();

      await request(server())
        .get(`/articles?${query}`)
        .set(auth(reader.token))
        .expect(400);
    });
  });

  describe('GET /articles/feed', () => {
    it('shows only articles of followed authors', async () => {
      const followed = await newSession();
      const stranger = await newSession();
      const reader = await newSession();
      const mine = await createArticle(followed, 'Followed article');
      await createArticle(stranger, 'Stranger article');
      await request(server())
        .post(`/users/${followed.id}/follow`)
        .set(auth(reader.token))
        .expect(200);

      const response = await request(server())
        .get('/articles/feed')
        .set(auth(reader.token))
        .expect(200);
      const list = response.body as ListBody;

      expect(list.articlesCount).toBe(1);
      expect(list.articles[0]).toMatchObject({
        slug: mine.slug,
        author: { id: followed.id, following: true },
      });
    });

    it('is empty when the viewer follows nobody', async () => {
      const reader = await newSession();

      const response = await request(server())
        .get('/articles/feed')
        .set(auth(reader.token))
        .expect(200);

      expect(response.body).toEqual({ articles: [], articlesCount: 0 });
    });
  });

  describe('PATCH /articles/:slug', () => {
    it('updates the given fields and keeps the slug', async () => {
      const author = await newSession();
      const created = await createArticle(author);

      const response = await request(server())
        .patch(`/articles/${created.slug}`)
        .set(auth(author.token))
        .send({ title: 'A new title', body: 'New body' })
        .expect(200);

      expect(response.body).toMatchObject({
        slug: created.slug,
        title: 'A new title',
        description: 'Ever wonder how?',
        body: 'New body',
      });
    });

    it('accepts an empty body as a no-op', async () => {
      const author = await newSession();
      const created = await createArticle(author);

      const response = await request(server())
        .patch(`/articles/${created.slug}`)
        .set(auth(author.token))
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({ title: created.title });
    });

    it('rejects an empty title', async () => {
      const author = await newSession();
      const created = await createArticle(author);

      await request(server())
        .patch(`/articles/${created.slug}`)
        .set(auth(author.token))
        .send({ title: '  ' })
        .expect(400);
    });

    it('returns 403 for someone who is not the author', async () => {
      const author = await newSession();
      const other = await newSession();
      const created = await createArticle(author);

      await request(server())
        .patch(`/articles/${created.slug}`)
        .set(auth(other.token))
        .send({ title: 'Hijacked' })
        .expect(403);

      const unchanged = await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(200);
      expect((unchanged.body as ArticleBody).title).toBe(created.title);
    });

    it('returns 404 for an unknown slug', async () => {
      const author = await newSession();

      await request(server())
        .patch('/articles/missing-slug')
        .set(auth(author.token))
        .send({ title: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /articles/:slug', () => {
    it('deletes the article and its favorites', async () => {
      const author = await newSession();
      const created = await createArticle(author);
      await request(server())
        .post(`/articles/${created.slug}/favorite`)
        .set(auth(author.token))
        .expect(200);

      await request(server())
        .delete(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(204);

      await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(404);
      await request(server())
        .delete(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(404);
    });

    it('returns 403 for someone who is not the author', async () => {
      const author = await newSession();
      const other = await newSession();
      const created = await createArticle(author);

      await request(server())
        .delete(`/articles/${created.slug}`)
        .set(auth(other.token))
        .expect(403);

      await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(200);
    });
  });

  describe('favorite and unfavorite', () => {
    it('is idempotent and keeps an accurate count', async () => {
      const author = await newSession();
      const fan = await newSession();
      const secondFan = await newSession();
      const created = await createArticle(author);
      const favorite = (session: Session) =>
        request(server())
          .post(`/articles/${created.slug}/favorite`)
          .set(auth(session.token))
          .expect(200);

      await favorite(fan);
      const again = await favorite(fan);
      expect(again.body).toMatchObject({ favorited: true, favoritesCount: 1 });

      const both = await favorite(secondFan);
      expect(both.body).toMatchObject({ favorited: true, favoritesCount: 2 });

      const fanView = await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(author.token))
        .expect(200);
      expect(fanView.body).toMatchObject({
        favorited: false,
        favoritesCount: 2,
      });

      const removed = await request(server())
        .delete(`/articles/${created.slug}/favorite`)
        .set(auth(fan.token))
        .expect(200);
      expect(removed.body).toMatchObject({
        favorited: false,
        favoritesCount: 1,
      });

      const removedAgain = await request(server())
        .delete(`/articles/${created.slug}/favorite`)
        .set(auth(fan.token))
        .expect(200);
      expect(removedAgain.body).toMatchObject({ favoritesCount: 1 });
    });

    it('returns 404 for an unknown slug', async () => {
      const fan = await newSession();

      await request(server())
        .post('/articles/missing-slug/favorite')
        .set(auth(fan.token))
        .expect(404);
      await request(server())
        .delete('/articles/missing-slug/favorite')
        .set(auth(fan.token))
        .expect(404);
    });
  });

  describe('inactive viewer', () => {
    it('gets 401 on every article route', async () => {
      const viewer = await newSession();
      const author = await newSession();
      const created = await createArticle(author);
      await users.update({ id: viewer.id }, { active: false });

      await request(server())
        .get('/articles')
        .set(auth(viewer.token))
        .expect(401);
      await request(server())
        .get(`/articles/${created.slug}`)
        .set(auth(viewer.token))
        .expect(401);
    });
  });
});
