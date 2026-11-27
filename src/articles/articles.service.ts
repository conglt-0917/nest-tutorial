import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ATTACHABLE_TYPE,
  ATTACHMENT_KIND,
} from '../attachments/attachments.constants.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { isUniqueViolation } from '../common/utils/database-error.util.js';
import { buildSlug } from '../common/utils/slug.util.js';
import { Follow } from '../users/follow.entity.js';
import { FollowsService } from '../users/follows.service.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { SLUG_RETRY_ATTEMPTS } from './articles.constants.js';
import { Article } from './article.entity.js';
import {
  ArticleDto,
  ArticlesListDto,
  ArticleSummaryDto,
} from './dto/article.dto.js';
import { Favorite } from './favorite.entity.js';
import { FavoritesService } from './favorites.service.js';
import type {
  ArticleFilters,
  Pagination,
} from './interfaces/article-filters.interface.js';
import type { CreateArticleInput } from './interfaces/create-article-input.interface.js';
import type { UpdateArticleInput } from './interfaces/update-article-input.interface.js';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articlesRepository: Repository<Article>,
    private readonly usersService: UsersService,
    private readonly favoritesService: FavoritesService,
    private readonly followsService: FollowsService,
    private readonly attachmentsService: AttachmentsService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    viewerId: string,
    input: CreateArticleInput,
  ): Promise<ArticleDto> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.saveWithUniqueSlug(viewerId, input);
    return this.buildOne(viewerId, article);
  }

  async list(
    viewerId: string,
    filters: ArticleFilters,
    pagination: Pagination,
  ): Promise<ArticlesListDto> {
    await this.usersService.getActiveUser(viewerId);
    const query = this.activeAuthorQuery();
    if (filters.authorId) {
      query.andWhere('article.authorId = :authorId', {
        authorId: filters.authorId,
      });
    }
    if (filters.favoritedBy) {
      query.innerJoin(
        Favorite,
        'favorite',
        'favorite.articleId = article.id AND favorite.userId = :favoritedBy',
        { favoritedBy: filters.favoritedBy },
      );
    }
    return this.buildPage(viewerId, query, pagination);
  }

  async feed(
    viewerId: string,
    pagination: Pagination,
  ): Promise<ArticlesListDto> {
    await this.usersService.getActiveUser(viewerId);
    const query = this.activeAuthorQuery().innerJoin(
      Follow,
      'follow',
      'follow.followingId = article.authorId AND follow.followerId = :viewerId',
      { viewerId },
    );
    return this.buildPage(viewerId, query, pagination);
  }

  async get(viewerId: string, slug: string): Promise<ArticleDto> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.getBySlug(slug);
    return this.buildOne(viewerId, article);
  }

  async update(
    viewerId: string,
    slug: string,
    changes: UpdateArticleInput,
  ): Promise<ArticleDto> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.getOwnedBySlug(viewerId, slug);
    const values = definedEntries(changes);
    if (Object.keys(values).length === 0) {
      return this.buildOne(viewerId, article);
    }
    const result = await this.articlesRepository.update(
      { id: article.id },
      values,
    );
    if (!result.affected) throw this.notFound();
    return this.buildOne(viewerId, await this.getBySlug(slug));
  }

  async remove(viewerId: string, slug: string): Promise<void> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.getOwnedBySlug(viewerId, slug);
    await this.articlesRepository.delete({ id: article.id });
  }

  async favorite(viewerId: string, slug: string): Promise<ArticleDto> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.getBySlug(slug);
    await this.favoritesService.favorite(viewerId, article.id);
    return this.buildOne(viewerId, article);
  }

  async unfavorite(viewerId: string, slug: string): Promise<ArticleDto> {
    await this.usersService.getActiveUser(viewerId);
    const article = await this.getBySlug(slug);
    await this.favoritesService.unfavorite(viewerId, article.id);
    return this.buildOne(viewerId, article);
  }

  private async saveWithUniqueSlug(
    authorId: string,
    input: CreateArticleInput,
  ): Promise<Article> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.articlesRepository.save(
          this.articlesRepository.create({
            ...input,
            authorId,
            slug: buildSlug(input.title),
          }),
        );
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= SLUG_RETRY_ATTEMPTS) {
          // sunlint-disable-next-line C018, C030 -- a slug collision is retried; any other error is rethrown unchanged to keep the stack
          throw error;
        }
      }
    }
  }

  private activeAuthorQuery(): SelectQueryBuilder<Article> {
    return this.articlesRepository
      .createQueryBuilder('article')
      .innerJoin(User, 'author', 'author.id = article.authorId')
      .where('author.active = :active', { active: true });
  }

  private async getBySlug(slug: string): Promise<Article> {
    const article = await this.activeAuthorQuery()
      .andWhere('article.slug = :slug', { slug })
      .getOne();
    if (!article) throw this.notFound();
    return article;
  }

  private async getOwnedBySlug(
    viewerId: string,
    slug: string,
  ): Promise<Article> {
    const article = await this.getBySlug(slug);
    if (article.authorId !== viewerId) {
      throw new ForbiddenException(this.i18n.t('articles.NOT_ARTICLE_AUTHOR'));
    }
    return article;
  }

  private async buildPage(
    viewerId: string,
    query: SelectQueryBuilder<Article>,
    pagination: Pagination,
  ): Promise<ArticlesListDto> {
    const [articles, articlesCount] = await query
      .orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC')
      .offset(pagination.offset)
      .limit(pagination.limit)
      .getManyAndCount();
    const views = await this.buildViews(viewerId, articles);
    return Object.assign(new ArticlesListDto(), {
      articles: views.map((view) => ArticleSummaryDto.from(view)),
      articlesCount,
    });
  }

  private async buildOne(
    viewerId: string,
    article: Article,
  ): Promise<ArticleDto> {
    const [view] = await this.buildViews(viewerId, [article]);
    if (!view) throw this.notFound();
    return view;
  }

  private async buildViews(
    viewerId: string,
    articles: Article[],
  ): Promise<ArticleDto[]> {
    const articleIds = articles.map((article) => article.id);
    const authorIds = [...new Set(articles.map((article) => article.authorId))];
    const [authors, counts, favoritedIds, followingIds, avatarUrls] =
      await Promise.all([
        this.usersService.findActiveByIds(authorIds),
        this.favoritesService.countByArticleIds(articleIds),
        this.favoritesService.findFavoritedIds(viewerId, articleIds),
        this.followsService.findFollowingIds(viewerId, authorIds),
        this.attachmentsService.findUrls(
          ATTACHABLE_TYPE.USER,
          authorIds,
          ATTACHMENT_KIND.AVATAR,
        ),
      ]);
    const authorsById = new Map(authors.map((author) => [author.id, author]));

    return articles.flatMap((article) => {
      const author = authorsById.get(article.authorId);
      if (!author) return [];
      return Object.assign(new ArticleDto(), {
        slug: article.slug,
        title: article.title,
        description: article.description,
        body: article.body,
        favorited: favoritedIds.has(article.id),
        favoritesCount: counts.get(article.id) ?? 0,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        author: {
          id: author.id,
          name: author.name,
          bio: author.bio,
          avatarUrl: avatarUrls.get(author.id) ?? null,
          following: followingIds.has(author.id),
        },
      });
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException(this.i18n.t('articles.ARTICLE_NOT_FOUND'));
  }
}

function definedEntries(changes: UpdateArticleInput): UpdateArticleInput {
  return Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
}
