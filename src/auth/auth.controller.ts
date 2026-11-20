import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { NoCache } from '../common/decorators/no-cache.decorator.js';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { TokenPairDto } from './dto/token-pair.dto.js';
import type {
  AuthUser,
  TokenPair,
} from './interfaces/jwt-payload.interface.js';

// sunlint-disable-next-line S041 -- logout revokes both tokens in the Redis blacklist (TokenBlacklistService)
@ApiTags('auth')
@ApiTooManyRequestsResponse()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: User })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  register(@Body() dto: RegisterDto): Promise<User> {
    return this.authService.register(dto);
  }

  // sunlint-disable-next-line S037 -- anti-cache headers come from @NoCache(); the rule only detects res.header() calls
  @Public()
  // sunlint-disable-next-line S045 -- rate-limited by @UseGuards(ThrottlerGuard) on the class; the rule only reads method decorators
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @NoCache()
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse()
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @NoCache()
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse()
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  // sunlint-disable-next-line S037 -- anti-cache headers come from @NoCache(); the rule only detects res.header() calls
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse()
  logout(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(authUser, dto.refreshToken);
  }
}
