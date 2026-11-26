import { Readable } from 'node:stream';
import {
  NotFoundException,
  ParseUUIDPipe,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import {
  HEADERS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import { AttachmentsController } from './attachments.controller.js';

describe('AttachmentsController', () => {
  const authUser: AuthUser = {
    id: 'u1',
    email: 'user@example.com',
    jti: 'jti-1',
    exp: 2,
  };
  const accessServiceMock = { getViewableFile: vi.fn() };
  let controller: AttachmentsController;

  const viewable = (fileName: string) => ({
    attachment: { id: 'a1', mimeType: 'image/png', size: 68, fileName },
    stream: Readable.from([Buffer.from('png')]),
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        { provide: AttachmentAccessService, useValue: accessServiceMock },
      ],
    }).compile();
    controller = moduleRef.get(AttachmentsController);
  });

  describe('GET /attachments/:id', () => {
    it('asks the access service for the file of the signed-in viewer', async () => {
      const file = viewable('me.png');
      accessServiceMock.getViewableFile.mockResolvedValue(file);

      const result = await controller.download(authUser, 'a1');

      expect(accessServiceMock.getViewableFile).toHaveBeenCalledWith(
        authUser,
        'a1',
      );
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getStream()).toBe(file.stream);
    });

    it('sends the stored type and size, inline', async () => {
      accessServiceMock.getViewableFile.mockResolvedValue(viewable('me.png'));

      const result = await controller.download(authUser, 'a1');

      expect(result.getHeaders()).toEqual({
        type: 'image/png',
        length: 68,
        disposition: "inline; filename*=UTF-8''me.png",
      });
    });

    it('percent-encodes the file name, so non-ASCII names and quotes cannot break the header', async () => {
      accessServiceMock.getViewableFile.mockResolvedValue(
        viewable('ảnh đại diện;x=1.png'),
      );

      const result = await controller.download(authUser, 'a1');

      expect(result.getHeaders().disposition).toBe(
        `inline; filename*=UTF-8''${encodeURIComponent('ảnh đại diện;x=1.png')}`,
      );
      expect(result.getHeaders().disposition).not.toMatch(/[^\x20-\x7e]/);
    });

    it.each([
      ['401 for an unusable viewer', new UnauthorizedException()],
      ['404 for a file the viewer may not see', new NotFoundException()],
    ])('propagates the %s', async (_label, error) => {
      accessServiceMock.getViewableFile.mockRejectedValue(error);

      await expect(controller.download(authUser, 'a1')).rejects.toBe(error);
    });

    it('is protected (not @Public), privately cacheable and never sniffed', () => {
      const handler = AttachmentsController.prototype.download;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, AttachmentsController),
      ).toBeUndefined();
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
        expect.arrayContaining([
          { name: 'Cache-Control', value: 'private, max-age=86400' },
          { name: 'X-Content-Type-Options', value: 'nosniff' },
        ]),
      );
    });

    it('validates the id with ParseUUIDPipe', () => {
      const args = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        AttachmentsController,
        'download',
      ) as Record<string, { data?: string; pipes: unknown[] }>;
      const idArg = Object.values(args).find((arg) => arg.data === 'id');

      expect(idArg?.pipes).toEqual([expect.any(ParseUUIDPipe)]);
    });
  });
});
