import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);

const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(32),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);

interface Session {
  id: string;
  email: string;
  token: string;
  refreshToken: string;
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
    const tokens = loggedIn.body as {
      accessToken: string;
      refreshToken: string;
    };
    return {
      id: (registered.body as { id: string }).id,
      email,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  const patchMe = (token: string) =>
    request(server()).patch('/users/me').set(auth(token));

  const download = (url: string, token: string) =>
    request(server())
      .get(url)
      .set(auth(token))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const uploadCount = async () => (await readdir(UPLOAD_DIR)).length;

  const avatarOf = (userId: string) =>
    attachments.findBy({ attachableType: 'user', attachableId: userId });

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
    const ids = created.map((u) => u.id);
    const files = await attachments.findBy({ attachableId: In(ids) });
    await Promise.all(
      files.map((file) =>
        rm(join(UPLOAD_DIR, file.storageKey), { force: true }),
      ),
    );
    await attachments.delete({ attachableId: In(ids) });
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

  describe('PATCH /users/me, more cases', () => {
    it('ignores fields it does not own (email, password, active, id)', async () => {
      const me = await newSession();

      const res = await patchMe(me.token)
        .field('name', 'Renamed')
        .field('email', 'hijack@example.com')
        .field('password', 'Another123!')
        .field('active', 'false')
        .field('id', randomUUID())
        .expect(200);

      expect(res.body).toMatchObject({
        id: me.id,
        email: me.email,
        name: 'Renamed',
        active: true,
      });
      const row = await users.findOneByOrFail({ id: me.id });
      expect(row).toMatchObject({ email: me.email, active: true });
      await request(server())
        .post('/auth/login')
        .send({ email: me.email, password: PASSWORD })
        .expect(200);
    });

    it('accepts the maximum lengths and rejects one more', async () => {
      const me = await newSession();

      await patchMe(me.token)
        .field('name', 'n'.repeat(100))
        .field('bio', 'b'.repeat(500))
        .expect(200);
      await patchMe(me.token).field('name', 'n'.repeat(101)).expect(400);

      const row = await users.findOneByOrFail({ id: me.id });
      expect(row.name).toHaveLength(100);
      expect(row.bio).toHaveLength(500);
    });

    it('translates errors with ?lang=vi', async () => {
      const me = await newSession();

      const invalidName = await request(server())
        .patch('/users/me?lang=vi')
        .set(auth(me.token))
        .field('name', '')
        .expect(400);
      expect(JSON.stringify(invalidName.body)).toContain(
        'tên không được để trống',
      );

      const invalidImage = await request(server())
        .patch('/users/me?lang=vi')
        .set(auth(me.token))
        .attach('avatar', GIF, 'a.gif')
        .expect(400);
      expect(invalidImage.body).toMatchObject({
        message: 'Ảnh đại diện phải là ảnh PNG, JPEG hoặc WebP',
      });
    });

    it('accepts a WebP avatar', async () => {
      const me = await newSession();

      const res = await patchMe(me.token)
        .attach('avatar', WEBP, 'a.webp')
        .expect(200);

      const [attachment] = await avatarOf(me.id);
      expect(attachment).toMatchObject({
        mimeType: 'image/webp',
        url: (res.body as { avatarUrl: string }).avatarUrl,
      });
      expect(attachment.storageKey).toMatch(/\.webp$/);
    });

    it('rejects a real image of a type that is not accepted (GIF)', async () => {
      const me = await newSession();
      const before = await uploadCount();

      await patchMe(me.token)
        .attach('avatar', GIF, { filename: 'a.gif', contentType: 'image/gif' })
        .expect(400);

      expect(await uploadCount()).toBe(before);
      expect(await avatarOf(me.id)).toHaveLength(0);
    });

    it('stores the detected type, not the one the client claims', async () => {
      const me = await newSession();

      await patchMe(me.token)
        .attach('avatar', JPEG, {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(200);

      const [attachment] = await avatarOf(me.id);
      expect(attachment.mimeType).toBe('image/jpeg');
      expect(attachment.storageKey).toMatch(/\.jpg$/);
      expect(attachment.fileName).toBe('photo.png');
    });

    it('rejects two avatar files and writes nothing', async () => {
      const me = await newSession();
      const before = await uploadCount();

      await patchMe(me.token)
        .attach('avatar', PNG, 'a.png')
        .attach('avatar', PNG, 'b.png')
        .expect(400);

      expect(await uploadCount()).toBe(before);
    });

    it('does not store the avatar when a text field is invalid', async () => {
      const me = await newSession();
      const before = await uploadCount();

      await patchMe(me.token)
        .field('name', '   ')
        .attach('avatar', PNG, 'a.png')
        .expect(400);

      expect(await uploadCount()).toBe(before);
      expect(await avatarOf(me.id)).toHaveLength(0);
    });

    it('an avatar-only update keeps name and bio, and GET /users/me shows the avatar', async () => {
      const me = await newSession('Keep Me');
      await patchMe(me.token).field('bio', 'Keep bio').expect(200);

      const res = await patchMe(me.token)
        .attach('avatar', PNG, 'a.png')
        .expect(200);
      const avatarUrl = (res.body as { avatarUrl: string }).avatarUrl;

      const fetched = await request(server())
        .get('/users/me')
        .set(auth(me.token))
        .expect(200);
      expect(fetched.body).toMatchObject({
        name: 'Keep Me',
        bio: 'Keep bio',
        avatarUrl,
      });
    });

    it('keeps exactly one avatar and one file when uploads run concurrently', async () => {
      const me = await newSession();

      const responses = await Promise.all(
        [PNG, JPEG, WEBP, PNG].map((buffer, i) =>
          patchMe(me.token).attach('avatar', buffer, `${i}.img`),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      const rows = await avatarOf(me.id);
      expect(rows).toHaveLength(1);
      const urls = responses.map(
        (r) => (r.body as { avatarUrl: string }).avatarUrl,
      );
      expect(urls).toContain(rows[0].url);
      const ids = urls.map((url) => url.split('/').pop());
      const left = (await readdir(UPLOAD_DIR)).filter((name) =>
        ids.some((id) => name.startsWith(`${id}.`)),
      );
      expect(left).toEqual([rows[0].storageKey]);
    });

    it('is a 401 for a deactivated user, and nothing is written', async () => {
      const me = await newSession();
      await users.update({ id: me.id }, { active: false });
      const before = await uploadCount();

      await patchMe(me.token)
        .field('name', 'X')
        .attach('avatar', PNG, 'a.png')
        .expect(401);

      expect(await uploadCount()).toBe(before);
      const row = await users.findOneByOrFail({ id: me.id });
      expect(row.name).toBe('E2E User');
    });

    it('is a 401 with a logged-out token', async () => {
      const me = await newSession();
      await request(server())
        .post('/auth/logout')
        .set(auth(me.token))
        .send({ refreshToken: me.refreshToken })
        .expect(204);

      await patchMe(me.token).field('name', 'X').expect(401);
    });

    it('is never cached', async () => {
      const me = await newSession();

      const res = await patchMe(me.token).field('name', 'X').expect(200);

      expect(res.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate',
      );
      expect(res.headers['pragma']).toBe('no-cache');
    });
  });

  describe('GET /attachments/:id, more cases', () => {
    async function uploadAvatar(session: Session, name = 'a.png') {
      const res = await patchMe(session.token)
        .attach('avatar', PNG, name)
        .expect(200);
      return (res.body as { avatarUrl: string }).avatarUrl;
    }

    it('sends length, private caching and an encoded UTF-8 file name', async () => {
      const me = await newSession();
      const avatarUrl = await uploadAvatar(me, 'ảnh "đại" diện.png');

      const res = await download(avatarUrl, me.token).expect(200);

      expect(res.headers['content-length']).toBe(String(PNG.length));
      expect(res.headers['cache-control']).toBe('private, max-age=86400');
      expect(res.headers['content-disposition']).toBe(
        `inline; filename*=UTF-8''${encodeURIComponent('ảnh đại diện.png')}`,
      );
    });

    it('lets the owner download their own avatar', async () => {
      const me = await newSession();
      const avatarUrl = await uploadAvatar(me);

      const res = await download(avatarUrl, me.token).expect(200);

      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    });

    it('is a 404 when the file is missing from disk', async () => {
      const me = await newSession();
      const avatarUrl = await uploadAvatar(me);
      const [attachment] = await avatarOf(me.id);
      await rm(join(UPLOAD_DIR, attachment.storageKey));

      await request(server()).get(avatarUrl).set(auth(me.token)).expect(404);
    });

    it('is a 401 for a deactivated viewer', async () => {
      const owner = await newSession();
      const viewer = await newSession();
      const avatarUrl = await uploadAvatar(owner);
      await users.update({ id: viewer.id }, { active: false });

      await request(server())
        .get(avatarUrl)
        .set(auth(viewer.token))
        .expect(401);
    });

    it('is a 404 for an attachment whose owner type is not served', async () => {
      const me = await newSession();
      const id = randomUUID();
      await attachments.insert({
        id,
        attachableType: 'post' as never,
        attachableId: me.id,
        kind: 'cover' as never,
        url: `/attachments/${id}`,
        fileName: 'x.png',
        mimeType: 'image/png',
        size: PNG.length,
        storageKey: `${id}.png`,
      });

      await request(server())
        .get(`/attachments/${id}`)
        .set(auth(me.token))
        .expect(404);
    });

    it('becomes available again when a deactivated owner is reactivated', async () => {
      const owner = await newSession();
      const viewer = await newSession();
      const avatarUrl = await uploadAvatar(owner);

      await users.update({ id: owner.id }, { active: false });
      await request(server())
        .get(avatarUrl)
        .set(auth(viewer.token))
        .expect(404);

      await users.update({ id: owner.id }, { active: true });
      await request(server())
        .get(avatarUrl)
        .set(auth(viewer.token))
        .expect(200);
    });
  });

  describe('profiles and follows, more cases', () => {
    it("shows the target's avatar and never the email", async () => {
      const viewer = await newSession();
      const target = await newSession();
      const res = await patchMe(target.token)
        .attach('avatar', PNG, 'a.png')
        .expect(200);

      const profile = await request(server())
        .get(`/users/${target.id}`)
        .set(auth(viewer.token))
        .expect(200);

      expect(profile.body).toMatchObject({
        avatarUrl: (res.body as { avatarUrl: string }).avatarUrl,
      });
      expect(profile.body).not.toHaveProperty('email');
      expect(profile.headers['cache-control']).toContain('no-store');
    });

    it('lets a user view their own profile', async () => {
      const me = await newSession('Me');

      const profile = await request(server())
        .get(`/users/${me.id}`)
        .set(auth(me.token))
        .expect(200);

      expect(profile.body).toMatchObject({ id: me.id, following: false });
    });

    it('counts both directions and only active users', async () => {
      const a = await newSession();
      const b = await newSession();
      const c = await newSession();
      for (const target of [b, c]) {
        await request(server())
          .post(`/users/${target.id}/follow`)
          .set(auth(a.token))
          .expect(200);
      }
      await request(server())
        .post(`/users/${a.id}/follow`)
        .set(auth(b.token))
        .expect(200);

      const before = await request(server())
        .get(`/users/${a.id}`)
        .set(auth(b.token))
        .expect(200);
      expect(before.body).toMatchObject({
        followersCount: 1,
        followingCount: 2,
        following: true,
      });

      await users.update({ id: c.id }, { active: false });
      const after = await request(server())
        .get(`/users/${a.id}`)
        .set(auth(b.token))
        .expect(200);
      expect(after.body).toMatchObject({ followingCount: 1 });
    });

    it('is a 401 for a deactivated viewer', async () => {
      const viewer = await newSession();
      const target = await newSession();
      await users.update({ id: viewer.id }, { active: false });

      await request(server())
        .get(`/users/${target.id}`)
        .set(auth(viewer.token))
        .expect(401);
      await request(server())
        .post(`/users/${target.id}/follow`)
        .set(auth(viewer.token))
        .expect(401);
      await request(server())
        .delete(`/users/${target.id}/follow`)
        .set(auth(viewer.token))
        .expect(401);
    });

    it('unfollow is a 404 for an unknown user and a 400 for a malformed id', async () => {
      const me = await newSession();

      await request(server())
        .delete(`/users/${randomUUID()}/follow`)
        .set(auth(me.token))
        .expect(404);
      await request(server())
        .delete('/users/not-a-uuid/follow')
        .set(auth(me.token))
        .expect(400);
      await request(server())
        .post('/users/not-a-uuid/follow')
        .set(auth(me.token))
        .expect(400);
    });

    it('translates errors with ?lang=vi', async () => {
      const me = await newSession();

      const self = await request(server())
        .post(`/users/${me.id}/follow?lang=vi`)
        .set(auth(me.token))
        .expect(400);
      expect(self.body).toMatchObject({
        message: 'Bạn không thể theo dõi hoặc bỏ theo dõi chính mình',
      });

      const unknown = await request(server())
        .get(`/users/${randomUUID()}?lang=vi`)
        .set(auth(me.token))
        .expect(404);
      expect(unknown.body).toMatchObject({
        message: 'Không tìm thấy người dùng',
      });
    });

    it('removes follows together with a deleted user', async () => {
      const follower = await newSession();
      const target = await newSession();
      await request(server())
        .post(`/users/${target.id}/follow`)
        .set(auth(follower.token))
        .expect(200);

      await users.delete({ id: follower.id });

      const rows = await app
        .get(DataSource)
        .query('SELECT 1 FROM follows WHERE follower_id = $1', [follower.id]);
      expect(rows).toHaveLength(0);
    });

    it('the database refuses a self-follow even without the service check', async () => {
      const me = await newSession();

      await expect(
        app
          .get(DataSource)
          .query(
            'INSERT INTO follows (follower_id, following_id) VALUES ($1, $1)',
            [me.id],
          ),
      ).rejects.toThrow(/CHK_follows_not_self/);
    });
  });
});
