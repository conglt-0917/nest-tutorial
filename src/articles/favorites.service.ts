import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Favorite } from './favorite.entity.js';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoritesRepository: Repository<Favorite>,
  ) {}

  async favorite(userId: string, articleId: string): Promise<void> {
    await this.favoritesRepository
      .createQueryBuilder()
      // sunlint-disable-next-line C033 -- the repository's own query builder; Repository.insert has no ON CONFLICT DO NOTHING
      .insert()
      .into(Favorite)
      .values({ userId, articleId })
      .orIgnore()
      .execute();
  }

  async unfavorite(userId: string, articleId: string): Promise<void> {
    await this.favoritesRepository.delete({ userId, articleId });
  }

  async countByArticleIds(articleIds: string[]): Promise<Map<string, number>> {
    if (articleIds.length === 0) return new Map();
    const rows = await this.favoritesRepository
      .createQueryBuilder('favorite')
      .innerJoin(User, 'user', 'user.id = favorite.userId')
      .select('favorite.articleId', 'articleId')
      .addSelect('COUNT(*)', 'count')
      .where('favorite.articleId IN (:...articleIds)', { articleIds })
      .andWhere('user.active = :active', { active: true })
      .groupBy('favorite.articleId')
      .getRawMany<{ articleId: string; count: string }>();
    return new Map(rows.map((row) => [row.articleId, Number(row.count)]));
  }

  async findFavoritedIds(
    userId: string,
    articleIds: string[],
  ): Promise<Set<string>> {
    if (articleIds.length === 0) return new Set();
    const rows = await this.favoritesRepository.find({
      select: { articleId: true },
      where: { userId, articleId: In(articleIds) },
    });
    return new Set(rows.map((row) => row.articleId));
  }
}
