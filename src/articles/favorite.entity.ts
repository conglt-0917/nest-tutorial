import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('favorites')
export class Favorite {
  @PrimaryColumn({
    name: 'user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_favorites',
  })
  userId: string;

  @PrimaryColumn({
    name: 'article_id',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_favorites',
  })
  articleId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
