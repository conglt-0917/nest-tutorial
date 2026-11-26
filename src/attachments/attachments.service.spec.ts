import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Attachment } from './attachment.entity.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { AttachmentsService, attachmentUrl } from './attachments.service.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('AttachmentsService', () => {
  const repositoryMock = { findOneBy: vi.fn(), findOne: vi.fn() };
  const storageMock = { write: vi.fn(), open: vi.fn(), remove: vi.fn() };
  const txRepositoryMock = {
    find: vi.fn(),
    delete: vi.fn(),
    create: vi.fn((data: Partial<Attachment>) => ({ ...data })),
    save: vi.fn((data: Partial<Attachment>) => Promise.resolve(data)),
  };
  const managerMock = { getRepository: vi.fn(() => txRepositoryMock) };
  let service: AttachmentsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: getRepositoryToken(Attachment), useValue: repositoryMock },
        { provide: AttachmentStorageService, useValue: storageMock },
        { provide: I18nService, useValue: { t: vi.fn((key: string) => key) } },
      ],
    }).compile();
    service = moduleRef.get(AttachmentsService);
  });

  describe('storeImage', () => {
    it('writes a valid image under a random name with the detected type', async () => {
      const stored = await service.storeImage({
        originalname: '../../avatar.PNG',
        mimetype: 'application/octet-stream',
        size: PNG.length,
        buffer: PNG,
      });

      expect(stored.id).toMatch(UUID_PATTERN);
      expect(stored).toEqual({
        id: stored.id,
        storageKey: `${stored.id}.png`,
        fileName: 'avatar.PNG',
        mimeType: 'image/png',
        size: PNG.length,
      });
      expect(storageMock.write).toHaveBeenCalledWith(stored.storageKey, PNG);
    });

    it('rejects content that is not an accepted image, whatever its name and type', async () => {
      await expect(
        service.storeImage({
          originalname: 'evil.png',
          mimetype: 'image/png',
          size: 11,
          buffer: Buffer.from('<script>1</script>'),
        }),
      ).rejects.toThrow(
        new BadRequestException('attachments.INVALID_IMAGE_TYPE'),
      );
      expect(storageMock.write).not.toHaveBeenCalled();
    });

    it('rejects SVG', async () => {
      const svg = Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      );
      await expect(
        service.storeImage({
          originalname: 'a.svg',
          mimetype: 'image/svg+xml',
          size: svg.length,
          buffer: svg,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('replaceSingle', () => {
    const owner = { type: 'user', id: 'u1' } as const;
    const stored = {
      id: 'a2',
      storageKey: 'a2.png',
      fileName: 'me.png',
      mimeType: 'image/png',
      size: 10,
    };

    it('deletes the previous attachments and returns their storage keys', async () => {
      txRepositoryMock.find.mockResolvedValue([{ storageKey: 'a1.png' }]);

      const result = await service.replaceSingle(
        managerMock as never,
        owner,
        'avatar',
        stored,
      );

      const where = {
        attachableType: 'user',
        attachableId: 'u1',
        kind: 'avatar',
      };
      expect(txRepositoryMock.delete).toHaveBeenCalledWith(where);
      expect(txRepositoryMock.save).toHaveBeenCalledWith({
        id: 'a2',
        ...where,
        url: '/attachments/a2',
        fileName: 'me.png',
        mimeType: 'image/png',
        size: 10,
        storageKey: 'a2.png',
      });
      expect(result.removedKeys).toEqual(['a1.png']);
    });

    it('only inserts when there is no previous attachment', async () => {
      txRepositoryMock.find.mockResolvedValue([]);

      const result = await service.replaceSingle(
        managerMock as never,
        owner,
        'avatar',
        stored,
      );

      expect(txRepositoryMock.delete).not.toHaveBeenCalled();
      expect(result.removedKeys).toEqual([]);
    });
  });

  it('findUrl returns the url or null', async () => {
    repositoryMock.findOne.mockResolvedValueOnce({ url: '/attachments/a1' });
    repositoryMock.findOne.mockResolvedValueOnce(null);
    const owner = { type: 'user', id: 'u1' } as const;

    await expect(service.findUrl(owner, 'avatar')).resolves.toBe(
      '/attachments/a1',
    );
    await expect(service.findUrl(owner, 'avatar')).resolves.toBeNull();
  });

  it('openFile is a 404 and logs a warning when the file is missing from storage', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    storageMock.open.mockResolvedValue(null);

    await expect(
      service.openFile({ id: 'a1', storageKey: 'a1.png' } as Attachment),
    ).rejects.toThrow(new NotFoundException('attachments.NOT_FOUND'));
    expect(warn).toHaveBeenCalledWith('File of attachment a1 is missing');
    warn.mockRestore();
  });

  it('removeFiles keeps going and logs the error when one file cannot be removed', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    storageMock.remove.mockRejectedValueOnce(new Error('EACCES'));

    await expect(
      service.removeFiles(['a.png', 'b.png']),
    ).resolves.toBeUndefined();
    expect(storageMock.remove).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Could not remove file a.png: Error: EACCES',
    );
    error.mockRestore();
  });

  it('attachmentUrl points at the attachments endpoint', () => {
    expect(attachmentUrl('a1')).toBe('/attachments/a1');
  });

  describe('storeImage, other formats', () => {
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

    it.each([
      ['JPEG', JPEG, 'image/jpeg', '.jpg'],
      ['WebP', WEBP, 'image/webp', '.webp'],
    ])(
      'accepts %s and stores it with the matching extension',
      async (_label, buffer, mimeType, ext) => {
        const stored = await service.storeImage({
          originalname: 'photo',
          mimetype: 'image/png',
          size: buffer.length,
          buffer,
        });

        expect(stored.mimeType).toBe(mimeType);
        expect(stored.storageKey).toBe(`${stored.id}${ext}`);
      },
    );

    it('rejects a real image of a type that is not accepted (GIF)', async () => {
      await expect(
        service.storeImage({
          originalname: 'a.gif',
          mimetype: 'image/gif',
          size: GIF.length,
          buffer: GIF,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty file', async () => {
      await expect(
        service.storeImage({
          originalname: 'a.png',
          mimetype: 'image/png',
          size: 0,
          buffer: Buffer.alloc(0),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("does not change the caller's file object", async () => {
      const file = {
        originalname: 'a.png',
        mimetype: 'application/octet-stream',
        size: PNG.length,
        buffer: PNG,
      };

      await service.storeImage(file);

      expect(file.mimetype).toBe('application/octet-stream');
    });

    it('uses the real byte length, not the size the client reported', async () => {
      const stored = await service.storeImage({
        originalname: 'a.png',
        mimetype: 'image/png',
        size: 999_999,
        buffer: PNG,
      });

      expect(stored.size).toBe(PNG.length);
    });

    it('falls back to a generic file name when the client sends none', async () => {
      const stored = await service.storeImage({
        originalname: '',
        mimetype: 'image/png',
        size: PNG.length,
        buffer: PNG,
      });

      expect(stored.fileName).toBe('file');
    });

    it('gives every upload a new id and storage key', async () => {
      const file = {
        originalname: 'a.png',
        mimetype: 'image/png',
        size: PNG.length,
        buffer: PNG,
      };

      const [first, second] = await Promise.all([
        service.storeImage(file),
        service.storeImage(file),
      ]);

      expect(first.id).not.toBe(second.id);
      expect(first.storageKey).not.toBe(second.storageKey);
    });

    it('propagates a storage error', async () => {
      const error = new Error('EEXIST');
      storageMock.write.mockRejectedValueOnce(error);

      await expect(
        service.storeImage({
          originalname: 'a.png',
          mimetype: 'image/png',
          size: PNG.length,
          buffer: PNG,
        }),
      ).rejects.toBe(error);
    });
  });

  it('findById looks the attachment up by id', async () => {
    const attachment = { id: 'a1' };
    repositoryMock.findOneBy.mockResolvedValue(attachment);

    await expect(service.findById('a1')).resolves.toBe(attachment);
    expect(repositoryMock.findOneBy).toHaveBeenCalledWith({ id: 'a1' });
  });

  it('findUrl queries the owner and kind and selects only the url', async () => {
    repositoryMock.findOne.mockResolvedValue(null);

    await service.findUrl({ type: 'user', id: 'u1' }, 'avatar');

    expect(repositoryMock.findOne).toHaveBeenCalledWith({
      select: { id: true, url: true },
      where: { attachableType: 'user', attachableId: 'u1', kind: 'avatar' },
    });
  });

  it('openFile returns the stream of the stored file', async () => {
    const stream = { pipe: vi.fn() };
    storageMock.open.mockResolvedValue(stream);

    await expect(
      service.openFile({ id: 'a1', storageKey: 'a1.png' } as Attachment),
    ).resolves.toBe(stream);
    expect(storageMock.open).toHaveBeenCalledWith('a1.png');
  });

  it('removeFiles with no keys does nothing', async () => {
    await service.removeFiles([]);

    expect(storageMock.remove).not.toHaveBeenCalled();
  });

  it('replaceSingle propagates a database error', async () => {
    const error = new Error('unique violation');
    txRepositoryMock.find.mockResolvedValue([]);
    txRepositoryMock.save.mockRejectedValueOnce(error);

    await expect(
      service.replaceSingle(
        managerMock as never,
        { type: 'user', id: 'u1' },
        'avatar',
        {
          id: 'a2',
          storageKey: 'a2.png',
          fileName: 'a.png',
          mimeType: 'image/png',
          size: 1,
        },
      ),
    ).rejects.toBe(error);
  });
});
