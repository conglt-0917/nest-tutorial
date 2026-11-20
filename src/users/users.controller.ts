import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { NoCache } from '../common/decorators/no-cache.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // sunlint-disable-next-line S037 -- anti-cache headers come from @NoCache(); the rule only detects res.header() calls
  @Get('me')
  @NoCache()
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse()
  getMe(@CurrentUser() authUser: AuthUser): Promise<User> {
    return this.usersService.getActiveUser(authUser.id);
  }
}
