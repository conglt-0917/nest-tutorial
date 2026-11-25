import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import type { ConfigService } from '@nestjs/config';
import { AttachmentStorageService } from './attachment-storage.service.js';

describe('AttachmentStorageService', () => {
  let root: string;
  let storage: AttachmentStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'attachments-'));
    const config = { get: vi.fn(() => join(root, 'uploads')) };
    storage = new AttachmentStorageService(config as unknown as ConfigService);
    await storage.onModuleInit();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes, reads and removes a file', async () => {
    await storage.write('a1.png', Buffer.from('data'));
    expect(await readFile(join(root, 'uploads', 'a1.png'), 'utf8')).toBe(
      'data',
    );

    const stream = await storage.open('a1.png');
    expect(stream).not.toBeNull();
    expect(await text(stream!)).toBe('data');

    await storage.remove('a1.png');
    await expect(storage.open('a1.png')).resolves.toBeNull();
  });

  it('never overwrites an existing file', async () => {
    await storage.write('a1.png', Buffer.from('first'));

    await expect(
      storage.write('a1.png', Buffer.from('second')),
    ).rejects.toThrow();
  });

  it('removing a missing file is not an error', async () => {
    await expect(storage.remove('missing.png')).resolves.toBeUndefined();
  });

  it.each(['../secret', '../../etc/passwd', '/etc/passwd', '', '.'])(
    'rejects the key %j that leaves the upload directory',
    (key) => {
      expect(() => storage.pathOf(key)).toThrow('Invalid storage key');
    },
  );
});
