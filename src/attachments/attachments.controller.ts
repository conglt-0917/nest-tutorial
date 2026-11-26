import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import {
  ATTACHMENT_CACHE_CONTROL,
  ATTACHMENTS_ROUTE,
} from './attachments.constants.js';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller(ATTACHMENTS_ROUTE)
export class AttachmentsController {
  constructor(private readonly accessService: AttachmentAccessService) {}

  @Get(':id')
  @Header('Cache-Control', ATTACHMENT_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse()
  @ApiNotFoundResponse()
  download(
    @CurrentUser() authUser: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    return this.accessService.getViewableFile(authUser, id);
  }
}
