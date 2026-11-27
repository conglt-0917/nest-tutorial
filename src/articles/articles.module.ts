import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { UsersModule } from '../users/users.module.js';
import { Article } from './article.entity.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { Favorite } from './favorite.entity.js';
import { FavoritesService } from './favorites.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, Favorite]),
    UsersModule,
    AttachmentsModule,
  ],
  controllers: [ArticlesController],
  providers: [ArticlesService, FavoritesService],
})
export class ArticlesModule {}
