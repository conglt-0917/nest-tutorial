import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
@Unique('UQ_users_email', ['email'])
export class User {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_users_id' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'Backend developer' })
  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string | null;

  @ApiProperty({
    description: 'Inactive users cannot log in or use their tokens',
  })
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
