import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AVATAR_FIELD,
  AVATAR_MAX_SIZE,
} from '../attachments/attachments.constants.js';
import type { UploadedFileData } from '../attachments/interfaces/attachment.interface.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { NoCache } from '../common/decorators/no-cache.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { MeDto } from './dto/me.dto.js';
import { ProfileDto } from './dto/profile.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

// sunlint-disable S037 -- anti-cache headers come from @NoCache(); the rule only detects res.header() calls
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // The /me routes must stay above /:id.
  @Get('me')
  @NoCache()
  @ApiOkResponse({ type: MeDto })
  getMe(@CurrentUser() authUser: AuthUser): Promise<MeDto> {
    return this.usersService.getMe(authUser.id);
  }

  @Patch('me')
  @NoCache()
  @UseInterceptors(
    FileInterceptor(AVATAR_FIELD, {
      // Memory storage: the content is checked before anything is written.
      limits: { fileSize: AVATAR_MAX_SIZE, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: MeDto })
  @ApiBadRequestResponse({ description: 'Invalid field or image type' })
  @ApiPayloadTooLargeResponse({ description: 'Avatar larger than 2 MB' })
  updateMe(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: UpdateUserDto,
    // sunlint-disable-next-line S025 -- size is capped by multer limits; content is checked by magic number in AttachmentsService.storeImage
    @UploadedFile() avatar?: UploadedFileData,
  ): Promise<MeDto> {
    return this.usersService.updateMe(
      authUser.id,
      { name: dto.name, bio: dto.bio },
      avatar,
    );
  }

  @Get(':id')
  @NoCache()
  @ApiOkResponse({ type: ProfileDto })
  @ApiNotFoundResponse()
  getProfile(
    @CurrentUser() authUser: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProfileDto> {
    return this.usersService.getProfile(authUser.id, id);
  }

  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  @NoCache()
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({ description: 'Cannot follow yourself' })
  @ApiNotFoundResponse()
  follow(
    @CurrentUser() authUser: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProfileDto> {
    return this.usersService.follow(authUser.id, id);
  }

  @Delete(':id/follow')
  @NoCache()
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({ description: 'Cannot unfollow yourself' })
  @ApiNotFoundResponse()
  unfollow(
    @CurrentUser() authUser: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProfileDto> {
    return this.usersService.unfollow(authUser.id, id);
  }
}
