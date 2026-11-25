import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type {
  AttachableType,
  AttachmentKind,
} from './interfaces/attachment.interface.js';

@Entity('attachments')
export class Attachment {
  @ApiProperty({ format: 'uuid' })
  @PrimaryColumn('uuid', { primaryKeyConstraintName: 'PK_attachments_id' })
  id: string;

  @ApiProperty({ example: 'user' })
  @Column({ name: 'attachable_type', type: 'varchar', length: 50 })
  attachableType: AttachableType;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'attachable_id', type: 'uuid' })
  attachableId: string;

  @ApiProperty({ example: 'avatar' })
  @Column({ type: 'varchar', length: 50 })
  kind: AttachmentKind;

  @ApiProperty({ example: '/attachments/2f1c…' })
  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @ApiProperty({ example: 'me.png' })
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @ApiProperty({ description: 'Size in bytes' })
  @Column({ type: 'integer' })
  size: number;

  @Exclude()
  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
