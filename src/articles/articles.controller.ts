import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/interfaces/jwt-payload.interface.js';
import { NoCache } from '../common/decorators/no-cache.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ArticlesService } from './articles.service.js';
import { ArticleDto, ArticlesListDto } from './dto/article.dto.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';

// sunlint-disable S037 -- anti-cache headers come from @NoCache(); the rule only detects res.header() calls
@ApiTags('articles')
@ApiBearerAuth()
@ApiUnauthorizedResponse()
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Post()
  @NoCache()
  @ApiCreatedResponse({ type: ArticleDto })
  @ApiBadRequestResponse({ description: 'Invalid field' })
  create(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateArticleDto,
  ): Promise<ArticleDto> {
    return this.articlesService.create(authUser.id, {
      title: dto.title,
      description: dto.description,
      body: dto.body,
    });
  }

  @Get()
  @NoCache()
  @ApiOkResponse({ type: ArticlesListDto })
  @ApiBadRequestResponse({ description: 'Invalid filter or pagination' })
  list(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListArticlesQueryDto,
  ): Promise<ArticlesListDto> {
    return this.articlesService.list(
      authUser.id,
      { authorId: query.authorId, favoritedBy: query.favoritedBy },
      { limit: query.limit, offset: query.offset },
    );
  }

  @Get('feed')
  @NoCache()
  @ApiOkResponse({ type: ArticlesListDto })
  @ApiBadRequestResponse({ description: 'Invalid pagination' })
  feed(
    @CurrentUser() authUser: AuthUser,
    @Query() query: PaginationQueryDto,
  ): Promise<ArticlesListDto> {
    return this.articlesService.feed(authUser.id, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':slug')
  @NoCache()
  @ApiOkResponse({ type: ArticleDto })
  @ApiNotFoundResponse()
  get(
    @CurrentUser() authUser: AuthUser,
    @Param('slug') slug: string,
  ): Promise<ArticleDto> {
    return this.articlesService.get(authUser.id, slug);
  }

  @Patch(':slug')
  @NoCache()
  @ApiOkResponse({ type: ArticleDto })
  @ApiBadRequestResponse({ description: 'Invalid field' })
  @ApiForbiddenResponse({ description: 'Only the author can update' })
  @ApiNotFoundResponse()
  update(
    @CurrentUser() authUser: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleDto> {
    return this.articlesService.update(authUser.id, slug, {
      title: dto.title,
      description: dto.description,
      body: dto.body,
    });
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @NoCache()
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Only the author can delete' })
  @ApiNotFoundResponse()
  remove(
    @CurrentUser() authUser: AuthUser,
    @Param('slug') slug: string,
  ): Promise<void> {
    return this.articlesService.remove(authUser.id, slug);
  }

  @Post(':slug/favorite')
  @HttpCode(HttpStatus.OK)
  @NoCache()
  @ApiOkResponse({ type: ArticleDto })
  @ApiNotFoundResponse()
  favorite(
    @CurrentUser() authUser: AuthUser,
    @Param('slug') slug: string,
  ): Promise<ArticleDto> {
    return this.articlesService.favorite(authUser.id, slug);
  }

  @Delete(':slug/favorite')
  @NoCache()
  @ApiOkResponse({ type: ArticleDto })
  @ApiNotFoundResponse()
  unfavorite(
    @CurrentUser() authUser: AuthUser,
    @Param('slug') slug: string,
  ): Promise<ArticleDto> {
    return this.articlesService.unfavorite(authUser.id, slug);
  }
}
