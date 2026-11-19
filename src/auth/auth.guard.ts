import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import type { AuthUser } from './interfaces/jwt-payload.interface.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import { TokenService } from './token.service.js';

const BEARER_SCHEME = 'Bearer';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = extractBearerToken(request);
    const payload = token
      ? await this.tokenService.verify(token, 'access')
      : null;
    if (!payload || (await this.tokenBlacklist.isRevoked(payload.jti))) {
      throw new UnauthorizedException(this.i18n.t('auth.UNAUTHORIZED'));
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      jti: payload.jti,
      exp: payload.exp,
    };
    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === BEARER_SCHEME && token ? token : undefined;
}
