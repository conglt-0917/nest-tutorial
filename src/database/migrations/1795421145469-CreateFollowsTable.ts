import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFollowsTable1795421145469 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "follows" (
        "follower_id" uuid NOT NULL,
        "following_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follows" PRIMARY KEY ("follower_id", "following_id"),
        CONSTRAINT "FK_follows_follower_id" FOREIGN KEY ("follower_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_follows_following_id" FOREIGN KEY ("following_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_follows_not_self" CHECK ("follower_id" <> "following_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_follows_following_id" ON "follows" ("following_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "follows"`);
  }
}
