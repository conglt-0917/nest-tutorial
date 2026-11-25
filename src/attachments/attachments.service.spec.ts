import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Attachment } from './attachment.entity.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { AttachmentsService, attachmentUrl } from './attachments.service.js';

// 1x1 transparent PNG.
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
        mimetype: 'application/octet-stream', // client's claim is ignored
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

  it('openFile is a 404 when the file is missing from storage', async () => {
    storageMock.open.mockResolvedValue(null);

    await expect(
      service.openFile({ id: 'a1', storageKey: 'a1.png' } as Attachment),
    ).rejects.toThrow(new NotFoundException('attachments.NOT_FOUND'));
  });

  it('removeFiles keeps going when one file cannot be removed', async () => {
    storageMock.remove.mockRejectedValueOnce(new Error('EACCES'));

    await expect(
      service.removeFiles(['a.png', 'b.png']),
    ).resolves.toBeUndefined();
    expect(storageMock.remove).toHaveBeenCalledTimes(2);
  });

  it('attachmentUrl points at the attachments endpoint', () => {
    expect(attachmentUrl('a1')).toBe('/attachments/a1');
  });
});
