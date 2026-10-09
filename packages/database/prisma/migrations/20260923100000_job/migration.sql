-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'CLOSED');
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT');
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "posted_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "location" TEXT NOT NULL,
    "work_mode" "WorkMode" NOT NULL,
    "experience" TEXT NOT NULL,
    "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "application_url" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_job_status_deadline" ON "job"("status", "deadline");
CREATE INDEX "ix_job_poster" ON "job"("posted_by", "created_at");
CREATE INDEX "ix_job_moderation_queue" ON "job"("status", "created_at");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job" ADD CONSTRAINT "job_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity that Prisma cannot express (ck_job_reject_note precedent).
ALTER TABLE "job"
  ADD CONSTRAINT "ck_job_reject_note"      CHECK ("status" <> 'REJECTED' OR "review_note" IS NOT NULL),
  ADD CONSTRAINT "ck_job_application_url"  CHECK (starts_with("application_url", 'https://')),
  ADD CONSTRAINT "ck_job_title"            CHECK (char_length("title") BETWEEN 1 AND 200),
  ADD CONSTRAINT "ck_job_company"          CHECK (char_length("company") BETWEEN 1 AND 200),
  ADD CONSTRAINT "ck_job_description"      CHECK (char_length("description") BETWEEN 1 AND 5000),
  ADD CONSTRAINT "ck_job_review_note_len"  CHECK ("review_note" IS NULL OR char_length("review_note") <= 1000),
  ADD CONSTRAINT "ck_job_skills_count"     CHECK (cardinality("skills") <= 20);
