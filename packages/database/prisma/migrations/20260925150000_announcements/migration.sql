-- Phase 12E: institutional announcements are posts (domain model "Announcements").
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';
ALTER TYPE "NotificationDomain" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';

ALTER TABLE "post" ADD COLUMN "title" TEXT;
ALTER TABLE "post" ADD CONSTRAINT "ck_post_title_announcement"
  CHECK (("post_type"::text = 'ANNOUNCEMENT') = ("title" IS NOT NULL));
ALTER TABLE "post" ADD CONSTRAINT "ck_post_title_length"
  CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 120);

CREATE INDEX "ix_post_announcement" ON "post" ("created_at" DESC, "id" DESC)
  WHERE "post_type" = 'ANNOUNCEMENT' AND NOT "deleted";
