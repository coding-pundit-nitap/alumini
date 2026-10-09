-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('TEXT', 'ACHIEVEMENT');
CREATE TYPE "AchievementCategory" AS ENUM ('AWARD', 'PUBLICATION', 'PROMOTION', 'CERTIFICATION', 'ENTREPRENEURSHIP', 'OTHER');
CREATE TYPE "AchievementStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "post" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "chapter_id" UUID,
    "content" TEXT NOT NULL,
    "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "link_url" TEXT,
    "post_type" "PostType" NOT NULL DEFAULT 'TEXT',
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "achievement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL,
    "status" "AchievementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewed_by_id" UUID,
    "published_post_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_post_feed" ON "post"("created_at" DESC, "id");
CREATE INDEX "ix_comment_post" ON "comment"("post_id", "created_at");
CREATE UNIQUE INDEX "uq_reaction_per_user" ON "reaction"("post_id", "user_id");
CREATE INDEX "ix_achievement_status" ON "achievement"("status", "created_at");
CREATE UNIQUE INDEX "uq_achievement_published_post" ON "achievement"("published_post_id");

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post" ADD CONSTRAINT "post_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_published_post_id_fkey" FOREIGN KEY ("published_post_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity that Prisma cannot express.
ALTER TABLE "post"
  ADD CONSTRAINT "ck_post_content" CHECK (char_length("content") BETWEEN 1 AND 5000),
  ADD CONSTRAINT "ck_post_images" CHECK (cardinality("image_urls") <= 4),
  -- Reuses the https-only shape used for external links elsewhere in the schema (no existing named
  -- constraint to copy verbatim: profile_link only bounds length, not scheme — this is's own check).
  ADD CONSTRAINT "ck_post_link_https" CHECK ("link_url" IS NULL OR starts_with("link_url", 'https://'));

ALTER TABLE "comment"
  ADD CONSTRAINT "ck_comment_body" CHECK (char_length("body") BETWEEN 1 AND 2000);

ALTER TABLE "achievement"
  ADD CONSTRAINT "ck_achievement_title" CHECK (char_length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "ck_achievement_description" CHECK (char_length("description") BETWEEN 1 AND 5000),
  -- A PUBLISHED achievement always has its post; no other status may have one.
  ADD CONSTRAINT "ck_achievement_published" CHECK (("status" = 'PUBLISHED') = ("published_post_id" IS NOT NULL));
