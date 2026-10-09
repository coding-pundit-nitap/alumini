-- CreateEnum
CREATE TYPE "MentorContactMethod" AS ENUM ('IN_APP', 'EMAIL', 'VIDEO_CALL', 'PHONE');

-- CreateTable
CREATE TABLE "mentor_profile" (
    "user_id" UUID NOT NULL,
    "expertise" TEXT NOT NULL,
    "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "availability" TEXT NOT NULL DEFAULT '',
    "preferred_contact_method" "MentorContactMethod" NOT NULL DEFAULT 'IN_APP',
    "max_mentees" INTEGER NOT NULL DEFAULT 3,
    "accepting" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mentor_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "ix_mentor_profile_topics" ON "mentor_profile" USING GIN ("topics");

-- CreateIndex
CREATE INDEX "ix_mentor_profile_accepting" ON "mentor_profile"("accepting");

-- AddForeignKey
ALTER TABLE "mentor_profile" ADD CONSTRAINT "mentor_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backstops for the application's validation. Written with plain comparisons: none of these
-- columns is nullable, so no CHECK here can pass on NULL.
ALTER TABLE "mentor_profile"
  ADD CONSTRAINT "ck_mentor_max" CHECK ("max_mentees" BETWEEN 1 AND 20),
  ADD CONSTRAINT "ck_mentor_expertise" CHECK (char_length("expertise") BETWEEN 1 AND 1000),
  ADD CONSTRAINT "ck_mentor_availability" CHECK (char_length("availability") <= 200),
  ADD CONSTRAINT "ck_mentor_topics" CHECK (cardinality("topics") <= 10);
