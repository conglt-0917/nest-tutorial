import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { Follow } from './follow.entity.js';
import { FollowsService } from './follows.service.js';
import { User } from './user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Follow]), AttachmentsModule],
  controllers: [UsersController],
  providers: [UsersService, FollowsService],
  exports: [UsersService],
})
export class UsersModule {}
