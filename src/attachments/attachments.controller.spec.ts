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
    it('returns the file the access service builds for the signed-in viewer', async () => {
      const file = new StreamableFile(Buffer.from('png'));
      accessServiceMock.getViewableFile.mockResolvedValue(file);

      await expect(controller.download(authUser, 'a1')).resolves.toBe(file);
      expect(accessServiceMock.getViewableFile).toHaveBeenCalledWith(
        authUser,
        'a1',
      );
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
