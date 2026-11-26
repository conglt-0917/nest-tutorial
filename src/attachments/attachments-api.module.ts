import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsModule } from './attachments.module.js';

@Module({
  imports: [AttachmentsModule, UsersModule],
  controllers: [AttachmentsController],
  providers: [AttachmentAccessService],
})
export class AttachmentsApiModule {}
