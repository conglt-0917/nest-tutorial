import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { I18nService } from 'nestjs-i18n';
import { QueryFailedError } from 'typeorm';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type {
  AuthUser,
  TokenPair,
} from './interfaces/jwt-payload.interface.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenService } from './token.service.js';

export const BCRYPT_SALT_ROUNDS = 10;
const PG_UNIQUE_VIOLATION = '23505';

// sunlint-disable-next-line S041 -- logout revokes both tokens in the Redis blacklist (TokenBlacklistService)
@Injectable()
export class AuthService {
  private dummyPasswordHash?: Promise<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly i18n: I18nService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    if (await this.usersService.existsByEmail(dto.email)) {
      throw this.emailTaken();
    }
    const passwordHash = await hash(dto.password, BCRYPT_SALT_ROUNDS);
    try {
      return await this.usersService.create({
        email: dto.email,
        passwordHash,
        name: dto.name,
      });
    } catch (error) {
      // sunlint-disable-next-line C018 -- nothing is logged here; a unique-violation race is mapped to 409
      if (isUniqueViolation(error)) throw this.emailTaken();
      // sunlint-disable-next-line C018, C030 -- unexpected errors are rethrown unchanged to keep the stack; Nest logs them
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    const passwordMatches = await compare(
      dto.password,
      user?.password ?? (await this.getDummyPasswordHash()), // prevent timing attack
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(this.i18n.t('auth.INVALID_CREDENTIALS'));
    }
    return this.tokenService.issuePair(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.tokenService.verify(refreshToken, 'refresh');
    const revoked =
      payload !== null &&
      (await this.tokenBlacklist.revoke(payload.jti, payload.exp));
    const user = revoked ? await this.usersService.findById(payload.sub) : null;
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t('auth.INVALID_REFRESH_TOKEN'),
      );
    }
    return this.tokenService.issuePair(user);
  }

  async logout(authUser: AuthUser, refreshToken: string): Promise<void> {
    await this.tokenBlacklist.revoke(authUser.jti, authUser.exp);
    const payload = await this.tokenService.verify(refreshToken, 'refresh');
    if (payload?.sub === authUser.id) {
      await this.tokenBlacklist.revoke(payload.jti, payload.exp);
    }
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= hash(randomUUID(), BCRYPT_SALT_ROUNDS);
    return this.dummyPasswordHash;
  }

  private emailTaken(): ConflictException {
    return new ConflictException(this.i18n.t('auth.EMAIL_ALREADY_EXISTS'));
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_UNIQUE_VIOLATION
  );
}
