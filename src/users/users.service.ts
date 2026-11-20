import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import type { CreateUserInput } from './interfaces/create-user-input.interface.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly i18n: I18nService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  /** Returns null for unknown and for deactivated users alike. */
  findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id, active: true });
  }

  /**
   * The user behind a valid access token. The token can outlive its user
   * (deleted or deactivated after it was issued), which is a 401.
   */
  async getActiveUser(id: string): Promise<User> {
    const user = await this.findActiveById(id);
    if (!user) {
      throw new UnauthorizedException(this.i18n.t('auth.UNAUTHORIZED'));
    }
    return user;
  }

  /** Includes deactivated users, so their email cannot be registered again. */
  existsByEmail(email: string): Promise<boolean> {
    return this.usersRepository.existsBy({ email });
  }

  /**
   * Active user with the password hash (excluded from normal selects), for
   * login. Deactivated users are treated like unknown emails.
   */
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
}
