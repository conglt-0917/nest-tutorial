import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, In, Like, Repository } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Attachment } from './../src/attachments/attachment.entity.js';
import { AVATAR_MAX_SIZE } from './../src/attachments/attachments.constants.js';
import { User } from './../src/users/user.entity.js';

const RUN_ID = randomUUID().slice(0, 8);
const PASSWORD = 'Secret123!';
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');
// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
// Smallest JPEG header file-type recognises.
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);

interface Session {
  id: string;
  token: string;
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let users: Repository<User>;
  let attachments: Repository<Attachment>;
  let counter = 0;

  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function newSession(name = 'E2E User'): Promise<Session> {
    const email = `e2e-${RUN_ID}-users-${++counter}@example.com`;
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

  const patchMe = (token: string) =>
    request(server()).patch('/users/me').set(auth(token));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    const dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
    attachments = dataSource.getRepository(Attachment);
  });

  afterAll(async () => {
    const created = await users.findBy({ email: Like(`e2e-${RUN_ID}-%`) });
    await attachments.delete({ attachableId: In(created.map((u) => u.id)) });
    await users.delete({ email: Like(`e2e-${RUN_ID}-%`) });
    await app.close();
  });

  describe('PATCH /users/me', () => {
    it('updates name and bio, and an empty bio clears it', async () => {
      const me = await newSession();

      const updated = await patchMe(me.token)
        .field('name', '  New Name  ')
        .field('bio', 'Backend developer')
        .expect(200);
      expect(updated.body).toMatchObject({
        id: me.id,
        name: 'New Name',
        bio: 'Backend developer',
        avatarUrl: null,
      });
      expect(updated.headers['cache-control']).toContain('no-store');

      const cleared = await patchMe(me.token).field('bio', '').expect(200);
      expect(cleared.body).toMatchObject({ name: 'New Name', bio: null });

      const fetched = await request(server())
        .get('/users/me')
        .set(auth(me.token))
        .expect(200);
      expect(fetched.body).toMatchObject({ name: 'New Name', bio: null });
      expect(fetched.body).not.toHaveProperty('password');
    });

    it('validates the fields', async () => {
      const me = await newSession();

      await patchMe(me.token).field('name', '   ').expect(400);
      await patchMe(me.token).field('bio', 'x'.repeat(501)).expect(400);
    });

    it('requires a token', async () => {
      await request(server()).patch('/users/me').field('name', 'X').expect(401);
    });

    it('uploads an avatar that only signed-in users can download', async () => {
      const me = await newSession();
      const other = await newSession();

      const res = await patchMe(me.token)
        .attach('avatar', PNG, {
          filename: 'ảnh.png',
          contentType: 'image/png',
        })
        .expect(200);
      const avatarUrl = (res.body as { avatarUrl: string }).avatarUrl;
      expect(avatarUrl).toMatch(/^\/attachments\/[0-9a-f-]{36}$/);

      const attachment = await attachments.findOneByOrFail({
        attachableType: 'user',
        attachableId: me.id,
        kind: 'avatar',
      });
      expect(attachment).toMatchObject({
        url: avatarUrl,
        fileName: 'ảnh.png',
        mimeType: 'image/png',
        size: PNG.length,
      });
      expect(existsSync(join(UPLOAD_DIR, attachment.storageKey))).toBe(true);

      const file = await request(server())
        .get(avatarUrl)
        .set(auth(other.token))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-disposition']).toContain('inline');
      expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

      await request(server()).get(avatarUrl).expect(401);
    });

    it('replacing the avatar deletes the old attachment and file', async () => {
      const me = await newSession();

      const first = await patchMe(me.token).attach('avatar', PNG, 'a.png');
      const firstUrl = (first.body as { avatarUrl: string }).avatarUrl;
      const firstKey = (await attachments.findOneByOrFail({ url: firstUrl }))
        .storageKey;

      const second = await patchMe(me.token)
        .attach('avatar', JPEG, 'b.jpg')
        .expect(200);
      const secondUrl = (second.body as { avatarUrl: string }).avatarUrl;

      expect(secondUrl).not.toBe(firstUrl);
      expect(existsSync(join(UPLOAD_DIR, firstKey))).toBe(false);
      await request(server()).get(firstUrl).set(auth(me.token)).expect(404);
      const current = await request(server())
        .get(secondUrl)
        .set(auth(me.token))
        .expect(200);
      expect(current.headers['content-type']).toBe('image/jpeg');
      expect(
        await attachments.countBy({ attachableId: me.id, kind: 'avatar' }),
      ).toBe(1);
    });

    it('rejects a file whose content is not an image, whatever its name', async () => {
      const me = await newSession();
      const before = (await readdir(UPLOAD_DIR)).length;

      const res = await patchMe(me.token)
        .field('name', 'Should not be saved')
        .attach('avatar', Buffer.from('<script>alert(1)</script>'), {
          filename: 'x.png',
          contentType: 'image/png',
        })
        .expect(400);
      expect(res.body).toMatchObject({
        message: 'Avatar must be a PNG, JPEG or WebP image',
      });

      expect((await readdir(UPLOAD_DIR)).length).toBe(before);
      const user = await users.findOneByOrFail({ id: me.id });
      expect(user.name).toBe('E2E User');
    });

    it('rejects an avatar larger than the limit', async () => {
      const me = await newSession();
      const big = Buffer.concat([PNG, Buffer.alloc(AVATAR_MAX_SIZE)]);

      await patchMe(me.token).attach('avatar', big, 'big.png').expect(413);
    });

    it('rejects a file in another field', async () => {
      const me = await newSession();

      await patchMe(me.token).attach('photo', PNG, 'a.png').expect(400);
    });
  });

  describe('GET /attachments/:id', () => {
    it('is a 404 for an unknown id and a 400 for a malformed one', async () => {
      const me = await newSession();

      await request(server())
        .get(`/attachments/${randomUUID()}`)
        .set(auth(me.token))
        .expect(404);
      await request(server())
        .get('/attachments/123')
        .set(auth(me.token))
        .expect(400);
    });

    it("is a 404 for a deactivated user's avatar", async () => {
      const owner = await newSession();
      const viewer = await newSession();
      const res = await patchMe(owner.token).attach('avatar', PNG, 'a.png');
      const avatarUrl = (res.body as { avatarUrl: string }).avatarUrl;

      await users.update({ id: owner.id }, { active: false });

      await request(server())
        .get(avatarUrl)
        .set(auth(viewer.token))
        .expect(404);
    });
  });

  describe('profiles and follows', () => {
    it('shows a profile and follows / unfollows idempotently', async () => {
      const alice = await newSession('Alice');
      const bob = await newSession('Bob');
      await patchMe(bob.token).field('bio', "Bob's bio").expect(200);

      const profile = await request(server())
        .get(`/users/${bob.id}`)
        .set(auth(alice.token))
        .expect(200);
      expect(profile.body).toEqual({
        id: bob.id,
        name: 'Bob',
        bio: "Bob's bio",
        avatarUrl: null,
        followersCount: 0,
        followingCount: 0,
        following: false,
      });

      for (let i = 0; i < 2; i++) {
        const followed = await request(server())
          .post(`/users/${bob.id}/follow`)
          .set(auth(alice.token))
          .expect(200);
        expect(followed.body).toMatchObject({
          following: true,
          followersCount: 1,
        });
      }

      const aliceProfile = await request(server())
        .get(`/users/${alice.id}`)
        .set(auth(bob.token))
        .expect(200);
      expect(aliceProfile.body).toMatchObject({
        followingCount: 1,
        following: false,
      });

      for (let i = 0; i < 2; i++) {
        const unfollowed = await request(server())
          .delete(`/users/${bob.id}/follow`)
          .set(auth(alice.token))
          .expect(200);
        expect(unfollowed.body).toMatchObject({
          following: false,
          followersCount: 0,
        });
      }
    });

    it('does not count deactivated followers', async () => {
      const target = await newSession();
      const follower = await newSession();
      await request(server())
        .post(`/users/${target.id}/follow`)
        .set(auth(follower.token))
        .expect(200);

      await users.update({ id: follower.id }, { active: false });

      const profile = await request(server())
        .get(`/users/${target.id}`)
        .set(auth(target.token))
        .expect(200);
      expect(profile.body).toMatchObject({ followersCount: 0 });
    });

    it('rejects following yourself', async () => {
      const me = await newSession();

      await request(server())
        .post(`/users/${me.id}/follow`)
        .set(auth(me.token))
        .expect(400);
      await request(server())
        .delete(`/users/${me.id}/follow`)
        .set(auth(me.token))
        .expect(400);
    });

    it('is a 404 for unknown or deactivated users and a 400 for a malformed id', async () => {
      const me = await newSession();
      const inactive = await newSession();
      await users.update({ id: inactive.id }, { active: false });

      for (const id of [randomUUID(), inactive.id]) {
        await request(server())
          .get(`/users/${id}`)
          .set(auth(me.token))
          .expect(404);
        await request(server())
          .post(`/users/${id}/follow`)
          .set(auth(me.token))
          .expect(404);
      }
      await request(server())
        .get('/users/not-a-uuid')
        .set(auth(me.token))
        .expect(400);
    });

    it('requires a token', async () => {
      await request(server()).get(`/users/${randomUUID()}`).expect(401);
      await request(server()).post(`/users/${randomUUID()}/follow`).expect(401);
    });
  });
});
