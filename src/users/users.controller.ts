import { Controller, Get, Header, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse()
  async getMe(@CurrentUser() authUser: AuthUser): Promise<User> {
    const user = await this.usersService.findById(authUser.id);
    // The token is valid but its user was deleted.
    if (!user) {
      throw new UnauthorizedException(this.i18n.t('auth.UNAUTHORIZED'));
    }
    return user;
  }
}
