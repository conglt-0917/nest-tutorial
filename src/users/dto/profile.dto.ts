import { ApiProperty } from '@nestjs/swagger';

export class ProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

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
  followersCount: number;

  @ApiProperty()
  followingCount: number;

  @ApiProperty({ description: 'Whether the signed-in user follows this user' })
  following: boolean;
}
