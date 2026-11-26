import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { UsersService } from '../users/users.service.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import { AttachmentsService } from './attachments.service.js';

describe('AttachmentAccessService', () => {
  const viewer: AuthUser = { id: 'u1', email: 'a@b.c', jti: 'j', exp: 1 };
  const avatar = { id: 'a1', attachableType: 'user', attachableId: 'u2' };
  const stream = { pipe: vi.fn() };
  const attachmentsServiceMock = {
    findById: vi.fn(),
    openFile: vi.fn(),
    notFound: vi.fn(() => new NotFoundException('attachments.NOT_FOUND')),
  };
  const usersServiceMock = { getActiveUser: vi.fn(), findActiveById: vi.fn() };
  let service: AttachmentAccessService;

  beforeEach(async () => {
    vi.clearAllMocks();
    usersServiceMock.getActiveUser.mockResolvedValue({ id: 'u1' });
    usersServiceMock.findActiveById.mockResolvedValue({ id: 'u2' });
    attachmentsServiceMock.findById.mockResolvedValue(avatar);
    attachmentsServiceMock.openFile.mockResolvedValue(stream);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentAccessService,
        { provide: AttachmentsService, useValue: attachmentsServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();
    service = moduleRef.get(AttachmentAccessService);
  });

  it("returns an active user's avatar to any active viewer", async () => {
    await expect(service.getViewableFile(viewer, 'a1')).resolves.toEqual({
      attachment: avatar,
      stream,
    });
    expect(usersServiceMock.findActiveById).toHaveBeenCalledWith('u2');
  });

  it('is a 401 for a deactivated viewer, before looking the file up', async () => {
    usersServiceMock.getActiveUser.mockRejectedValue(
      new UnauthorizedException(),
    );

    await expect(service.getViewableFile(viewer, 'a1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(attachmentsServiceMock.findById).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown attachment', async () => {
    attachmentsServiceMock.findById.mockResolvedValue(null);

    await expect(service.getViewableFile(viewer, 'a1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it("is a 404 for a deactivated owner's avatar", async () => {
    usersServiceMock.findActiveById.mockResolvedValue(null);

    await expect(service.getViewableFile(viewer, 'a1')).rejects.toThrow(
      NotFoundException,
    );
    expect(attachmentsServiceMock.openFile).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown owner type', async () => {
    attachmentsServiceMock.findById.mockResolvedValue({
      ...avatar,
      attachableType: 'post',
    });

    await expect(service.getViewableFile(viewer, 'a1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('propagates the 404 when the file is missing from storage', async () => {
    const error = new NotFoundException('attachments.NOT_FOUND');
    attachmentsServiceMock.openFile.mockRejectedValue(error);

    await expect(service.getViewableFile(viewer, 'a1')).rejects.toBe(error);
  });

  it('lets the viewer see their own avatar', async () => {
    attachmentsServiceMock.findById.mockResolvedValue({
      ...avatar,
      attachableId: 'u1',
    });

    await expect(service.getViewableFile(viewer, 'a1')).resolves.toMatchObject({
      stream,
    });
  });
});
