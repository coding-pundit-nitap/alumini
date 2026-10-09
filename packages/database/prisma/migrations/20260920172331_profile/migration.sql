-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY', 'CONNECTIONS_ONLY', 'PRIVATE');

-- CreateTable
CREATE TABLE "profile" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "department_id" UUID,
    "degree_id" UUID,
    "graduation_year" INTEGER,
    "location" TEXT,
    "photo_url" TEXT,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'MEMBERS_ONLY',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "profile_department_id_graduation_year_idx" ON "profile"("department_id", "graduation_year");

-- CreateIndex
CREATE INDEX "profile_degree_id_idx" ON "profile"("degree_id");

-- CreateIndex
CREATE INDEX "profile_graduation_year_idx" ON "profile"("graduation_year");

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile" ADD CONSTRAINT "profile_degree_id_fkey" FOREIGN KEY ("degree_id") REFERENCES "degree"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Static range, never date-dependent. "Is this year plausible for this user, right
-- now" is an application rule, not a database constraint.
ALTER TABLE "profile" ADD CONSTRAINT ck_profile_graduation_year
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2010 AND 2100);
