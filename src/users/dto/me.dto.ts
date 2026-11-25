import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../user.entity.js';

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  bio: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/attachments/2f1c…',
    description: 'Download with the Bearer token',
  })
  avatarUrl: string | null;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(user: User, avatarUrl: string | null): MeDto {
    return Object.assign(new MeDto(), {
      id: user.id,
      email: user.email,
      name: user.name,
      bio: user.bio,
      avatarUrl,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }
}
