import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './attachment.entity.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { AttachmentsService } from './attachments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  providers: [AttachmentsService, AttachmentStorageService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
