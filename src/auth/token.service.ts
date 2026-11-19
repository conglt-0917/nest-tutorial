import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_REFRESH_EXPIRES_IN,
  JWT_ACCESS_EXPIRES_IN_KEY,
  JWT_ACCESS_SECRET_KEY,
  JWT_REFRESH_EXPIRES_IN_KEY,
  JWT_REFRESH_SECRET_KEY,
} from '../config/app.config.js';
import type {
  JwtPayload,
  TokenPair,
  TokenType,
} from './interfaces/jwt-payload.interface.js';

interface TokenSettings {
  secret: string;
  expiresIn: number;
}

/**
 * Signs and verifies access/refresh JWTs. The two token types use different
 * secrets and carry a `type` claim, so one can never stand in for the other.
 */
@Injectable()
export class TokenService {
  private readonly settings: Record<TokenType, TokenSettings>;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.settings = {
      access: {
        secret: configService.getOrThrow<string>(JWT_ACCESS_SECRET_KEY),
        expiresIn: Number(
          configService.get<string>(JWT_ACCESS_EXPIRES_IN_KEY) ??
            DEFAULT_JWT_ACCESS_EXPIRES_IN,
        ),
      },
      refresh: {
        secret: configService.getOrThrow<string>(JWT_REFRESH_SECRET_KEY),
        expiresIn: Number(
          configService.get<string>(JWT_REFRESH_EXPIRES_IN_KEY) ??
            DEFAULT_JWT_REFRESH_EXPIRES_IN,
        ),
      },
    };
  }

  async issuePair(user: { id: string; email: string }): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.sign(user, 'access'),
      this.sign(user, 'refresh'),
    ]);
    return { accessToken, refreshToken };
  }

  /** Returns the payload, or null when the token is invalid, expired or of another type. */
  async verify(token: string, type: TokenType): Promise<JwtPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.settings[type].secret,
      });
      return payload.type === type ? payload : null;
    } catch {
      return null;
    }
  }

  private sign(
    user: { id: string; email: string },
    type: TokenType,
  ): Promise<string> {
    const { secret, expiresIn } = this.settings[type];
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email, jti: randomUUID(), type },
      { secret, expiresIn },
    );
  }
}
