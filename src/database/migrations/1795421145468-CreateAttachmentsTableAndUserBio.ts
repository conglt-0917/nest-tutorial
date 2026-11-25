import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttachmentsTableAndUserBio1795421145468 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "bio" varchar(500)`);

    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "attachable_type" varchar(50) NOT NULL,
        "attachable_id" uuid NOT NULL,
        "kind" varchar(50) NOT NULL,
        "url" varchar(2048) NOT NULL,
        "file_name" varchar(255) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "size" integer NOT NULL,
        "storage_key" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attachments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attachments_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "CHK_attachments_size" CHECK ("size" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_attachable" ON "attachments" ("attachable_type", "attachable_id", "kind")`,
    );
    // One avatar per owner.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_attachments_avatar" ON "attachments" ("attachable_type", "attachable_id") WHERE "kind" = 'avatar'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "attachments"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bio"`);
  }
}
