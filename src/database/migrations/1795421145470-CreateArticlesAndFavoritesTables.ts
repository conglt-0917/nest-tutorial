import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateArticlesAndFavoritesTables1795421145470 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "articles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(300) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" varchar(500) NOT NULL,
        "body" text NOT NULL,
        "author_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_articles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_articles_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_articles_author_id" FOREIGN KEY ("author_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_articles_author_id" ON "articles" ("author_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_articles_created_at" ON "articles" ("created_at" DESC, "id" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "favorites" (
        "user_id" uuid NOT NULL,
        "article_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorites" PRIMARY KEY ("user_id", "article_id"),
        CONSTRAINT "FK_favorites_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_favorites_article_id" FOREIGN KEY ("article_id")
          REFERENCES "articles" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_favorites_article_id" ON "favorites" ("article_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "favorites"`);
    await queryRunner.query(`DROP TABLE "articles"`);
  }
}
