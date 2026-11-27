import { ApiProperty, OmitType } from '@nestjs/swagger';

export class ArticleAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  bio: string | null;

  @ApiProperty({ type: String, nullable: true, example: '/attachments/2f1c…' })
  avatarUrl: string | null;

  @ApiProperty({ description: 'Whether the signed-in user follows the author' })
  following: boolean;
}

export class ArticleDto {
  @ApiProperty({ example: 'how-to-train-your-dragon-1a2b3c4d' })
  slug: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ description: 'Whether the signed-in user favorited it' })
  favorited: boolean;

  @ApiProperty()
  favoritesCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: ArticleAuthorDto })
  author: ArticleAuthorDto;
}

export class ArticleSummaryDto extends OmitType(ArticleDto, ['body'] as const) {
  static from(article: ArticleDto): ArticleSummaryDto {
    return Object.assign(new ArticleSummaryDto(), {
      slug: article.slug,
      title: article.title,
      description: article.description,
      favorited: article.favorited,
      favoritesCount: article.favoritesCount,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      author: article.author,
    });
  }
}

export class ArticlesListDto {
  @ApiProperty({ type: [ArticleSummaryDto] })
  articles: ArticleSummaryDto[];

  @ApiProperty()
  articlesCount: number;
}
