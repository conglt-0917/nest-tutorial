import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('articles')
@Unique('UQ_articles_slug', ['slug'])
export class Article {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_articles_id',
  })
  id: string;

  @ApiProperty({ example: 'how-to-train-your-dragon-1a2b3c4d' })
  @Column({ type: 'varchar', length: 300 })
  slug: string;

  @ApiProperty({ example: 'How to train your dragon' })
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ example: 'Ever wonder how?' })
  @Column({ type: 'varchar', length: 500 })
  description: string;

  @ApiProperty()
  @Column({ type: 'text' })
  body: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
