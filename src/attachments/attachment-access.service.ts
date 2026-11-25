import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { UsersService } from '../users/users.service.js';
import type { Attachment } from './attachment.entity.js';
import { ATTACHABLE_TYPE } from './attachments.constants.js';
import { AttachmentsService } from './attachments.service.js';
import type { ViewableFile } from './interfaces/viewable-file.interface.js';

@Injectable()
export class AttachmentAccessService {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly usersService: UsersService,
  ) {}

  async getViewableFile(viewer: AuthUser, id: string): Promise<ViewableFile> {
    await this.usersService.getActiveUser(viewer.id);

    const attachment = await this.attachmentsService.findById(id);
    if (!attachment || !(await this.canView(attachment))) {
      throw this.attachmentsService.notFound();
    }
    const stream = await this.attachmentsService.openFile(attachment);
    return { attachment, stream };
  }

  private async canView(attachment: Attachment): Promise<boolean> {
    switch (attachment.attachableType) {
      case ATTACHABLE_TYPE.USER:
        return !!(await this.usersService.findActiveById(
          attachment.attachableId,
        ));
      default:
        return false;
    }
  }
}
