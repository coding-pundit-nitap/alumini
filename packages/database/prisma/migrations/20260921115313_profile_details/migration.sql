-- CreateEnum
CREATE TYPE "ProfileLinkType" AS ENUM ('LINKEDIN', 'GITHUB', 'TWITTER', 'WEBSITE', 'OTHER');

-- CreateTable
CREATE TABLE "profile_experience" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT,
    "designation" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_education" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "field_of_study" TEXT,
    "start_year" INTEGER NOT NULL,
    "end_year" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_skill" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "skill" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "ProfileLinkType" NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_experience_user_id_is_current_start_date_idx" ON "profile_experience"("user_id", "is_current", "start_date" DESC);

-- CreateIndex
CREATE INDEX "profile_education_user_id_end_year_idx" ON "profile_education"("user_id", "end_year" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_profile_link_user_url" ON "profile_link"("user_id", "url");

-- AddForeignKey
ALTER TABLE "profile_experience" ADD CONSTRAINT "profile_experience_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_education" ADD CONSTRAINT "profile_education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_skill" ADD CONSTRAINT "profile_skill_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_link" ADD CONSTRAINT "profile_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Experience: dates and "current" are consistent; lengths (spec 3B). Static CHECKs only, never date-dependent.
ALTER TABLE "profile_experience"
  ADD CONSTRAINT "ck_profile_experience_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
  ADD CONSTRAINT "ck_profile_experience_current" CHECK ("is_current" = ("end_date" IS NULL)),
  ADD CONSTRAINT "ck_profile_experience_company_length" CHECK (char_length("company") BETWEEN 1 AND 100),
  ADD CONSTRAINT "ck_profile_experience_designation_length" CHECK (char_length("designation") BETWEEN 1 AND 100),
  ADD CONSTRAINT "ck_profile_experience_industry_length" CHECK ("industry" IS NULL OR char_length("industry") <= 80);

ALTER TABLE "profile_education"
  ADD CONSTRAINT "ck_profile_education_start_year" CHECK ("start_year" BETWEEN 1950 AND 2100),
  ADD CONSTRAINT "ck_profile_education_end_year" CHECK ("end_year" IS NULL OR "end_year" BETWEEN 1950 AND 2100),
  ADD CONSTRAINT "ck_profile_education_years" CHECK ("end_year" IS NULL OR "end_year" >= "start_year"),
  ADD CONSTRAINT "ck_profile_education_institution_length" CHECK (char_length("institution") BETWEEN 1 AND 150),
  ADD CONSTRAINT "ck_profile_education_qualification_length" CHECK (char_length("qualification") BETWEEN 1 AND 100),
  ADD CONSTRAINT "ck_profile_education_field_length" CHECK ("field_of_study" IS NULL OR char_length("field_of_study") <= 100);

-- Skills are unique per member ignoring case; Prisma cannot model an expression index.
ALTER TABLE "profile_skill"
  ADD CONSTRAINT "ck_profile_skill_length" CHECK (char_length("skill") BETWEEN 1 AND 50);
CREATE UNIQUE INDEX "uq_profile_skill_user_lower" ON "profile_skill" ("user_id", lower("skill"));

ALTER TABLE "profile_link"
  ADD CONSTRAINT "ck_profile_link_url_length" CHECK (char_length("url") BETWEEN 1 AND 2048);
