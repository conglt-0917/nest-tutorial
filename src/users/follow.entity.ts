import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('follows')
export class Follow {
  @PrimaryColumn({
    name: 'follower_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_follows',
  })
  followerId: string;

  @PrimaryColumn({
    name: 'following_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_follows',
  })
  followingId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
