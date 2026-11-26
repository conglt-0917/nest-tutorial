import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import {
  ATTACHABLE_TYPE,
  ATTACHMENT_KIND,
} from '../attachments/attachments.constants.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import type {
  AttachableRef,
  StoredFile,
  UploadedFileData,
} from '../attachments/interfaces/attachment.interface.js';
import { MeDto } from './dto/me.dto.js';
import { ProfileDto } from './dto/profile.dto.js';
import { FollowsService } from './follows.service.js';
import type { CreateUserInput } from './interfaces/create-user-input.interface.js';
import type { UpdateUserInput } from './interfaces/update-user-input.interface.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly i18n: I18nService,
    private readonly attachmentsService: AttachmentsService,
    private readonly followsService: FollowsService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id, active: true });
  }

  async getActiveUser(id: string): Promise<User> {
    const user = await this.findActiveById(id);
    if (!user) {
      throw new UnauthorizedException(this.i18n.t('auth.UNAUTHORIZED'));
    }
    return user;
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.usersRepository.existsBy({ email });
  }

  findActiveByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .andWhere('user.active = :active', { active: true })
      .getOne();
  }

  create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create({
      email: input.email,
      password: input.passwordHash,
      name: input.name,
    });
    return this.usersRepository.save(user);
  }

  async getMe(id: string): Promise<MeDto> {
    const user = await this.getActiveUser(id);
    return MeDto.from(user, await this.findAvatarUrl(id));
  }

  async updateMe(
    id: string,
    changes: UpdateUserInput,
    avatar?: UploadedFileData,
  ): Promise<MeDto> {
    await this.getActiveUser(id);
    const stored = avatar
      ? await this.attachmentsService.storeImage(avatar)
      : null;

    let isCommitted = false;
    try {
      const { user, removedKeys } = await this.applyUpdate(id, changes, stored);
      isCommitted = true;
      await this.attachmentsService.removeFiles(removedKeys);
      return MeDto.from(user, await this.findAvatarUrl(id));
    } finally {
      if (stored && !isCommitted) {
        await this.attachmentsService.removeFiles([stored.storageKey]);
      }
    }
  }

  async getProfile(viewerId: string, targetId: string): Promise<ProfileDto> {
    await this.getActiveUser(viewerId);
    const target = await this.getProfileTarget(targetId);
    return this.buildProfile(viewerId, target);
  }

  async follow(viewerId: string, targetId: string): Promise<ProfileDto> {
    const target = await this.getFollowTarget(viewerId, targetId);
    await this.followsService.follow(viewerId, target.id);
    return this.buildProfile(viewerId, target);
  }

  async unfollow(viewerId: string, targetId: string): Promise<ProfileDto> {
    const target = await this.getFollowTarget(viewerId, targetId);
    await this.followsService.unfollow(viewerId, target.id);
    return this.buildProfile(viewerId, target);
  }

  private async applyUpdate(
    id: string,
    changes: UpdateUserInput,
    stored: StoredFile | null,
  ): Promise<{ user: User; removedKeys: string[] }> {
    // sunlint-disable-next-line C033 -- the transaction spans two repositories
    return this.usersRepository.manager.transaction(async (manager) => {
      // sunlint-disable-next-line C033 -- the users repository bound to this transaction
      const repository = manager.getRepository(User);
      const user = await repository.findOne({
        where: { id, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new UnauthorizedException(this.i18n.t('auth.UNAUTHORIZED'));
      }

      if (changes.name) user.name = changes.name;
      if (changes.bio) user.bio = changes.bio || null;
      const saved = await repository.save(user);

      if (!stored) return { user: saved, removedKeys: [] };
      const { removedKeys } = await this.attachmentsService.replaceSingle(
        manager,
        userRef(id),
        ATTACHMENT_KIND.AVATAR,
        stored,
      );
      return { user: saved, removedKeys };
    });
  }

  private async getFollowTarget(
    viewerId: string,
    targetId: string,
  ): Promise<User> {
    await this.getActiveUser(viewerId);
    if (viewerId === targetId) {
      throw new BadRequestException(
        this.i18n.t('users.CANNOT_FOLLOW_YOURSELF'),
      );
    }
    return this.getProfileTarget(targetId);
  }

  private async getProfileTarget(id: string): Promise<User> {
    const user = await this.findActiveById(id);
    if (!user) {
      throw new NotFoundException(this.i18n.t('users.USER_NOT_FOUND'));
    }
    return user;
  }

  private async buildProfile(
    viewerId: string,
    target: User,
  ): Promise<ProfileDto> {
    const [avatarUrl, followersCount, followingCount, following] =
      await Promise.all([
        this.findAvatarUrl(target.id),
        this.followsService.countFollowers(target.id),
        this.followsService.countFollowing(target.id),
        this.followsService.isFollowing(viewerId, target.id),
      ]);
    return Object.assign(new ProfileDto(), {
      id: target.id,
      name: target.name,
      bio: target.bio,
      avatarUrl,
      followersCount,
      followingCount,
      following,
    });
  }

  private findAvatarUrl(userId: string): Promise<string | null> {
    return this.attachmentsService.findUrl(
      userRef(userId),
      ATTACHMENT_KIND.AVATAR,
    );
  }
}

function userRef(id: string): AttachableRef {
  return { type: ATTACHABLE_TYPE.USER, id };
}
