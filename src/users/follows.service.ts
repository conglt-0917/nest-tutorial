import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Follow } from './follow.entity.js';
import { User } from './user.entity.js';

@Injectable()
export class FollowsService {
  constructor(
    @InjectRepository(Follow)
    private readonly followsRepository: Repository<Follow>,
  ) {}

  async follow(followerId: string, followingId: string): Promise<void> {
    await this.followsRepository
      .createQueryBuilder()
      // sunlint-disable-next-line C033 -- the repository's own query builder; Repository.insert has no ON CONFLICT DO NOTHING
      .insert()
      .into(Follow)
      .values({ followerId, followingId })
      .orIgnore()
      .execute();
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.followsRepository.delete({ followerId, followingId });
  }

  isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return this.followsRepository.existsBy({ followerId, followingId });
  }

  async findFollowingIds(
    followerId: string,
    candidateIds: string[],
  ): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.followsRepository.find({
      select: { followingId: true },
      where: { followerId, followingId: In(candidateIds) },
    });
    return new Set(rows.map((row) => row.followingId));
  }

  countFollowers(userId: string): Promise<number> {
    return this.followsRepository
      .createQueryBuilder('follow')
      .innerJoin(User, 'user', 'user.id = follow.followerId')
      .where('follow.followingId = :userId', { userId })
      .andWhere('user.active = :active', { active: true })
      .getCount();
  }

  countFollowing(userId: string): Promise<number> {
    return this.followsRepository
      .createQueryBuilder('follow')
      .innerJoin(User, 'user', 'user.id = follow.followingId')
      .where('follow.followerId = :userId', { userId })
      .andWhere('user.active = :active', { active: true })
      .getCount();
  }
}
