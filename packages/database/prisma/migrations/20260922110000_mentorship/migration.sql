-- CreateEnum
CREATE TYPE "MentorshipState" AS ENUM ('REQUESTED', 'ACCEPTED', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "mentorship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mentor_id" UUID NOT NULL,
    "mentee_id" UUID NOT NULL,
    "state" "MentorshipState" NOT NULL DEFAULT 'REQUESTED',
    "topic" TEXT,
    "message" TEXT NOT NULL,
    "response_note" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mentorship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_mentorship_mentor" ON "mentorship"("mentor_id", "state");

-- CreateIndex
CREATE INDEX "ix_mentorship_mentee" ON "mentorship"("mentee_id", "state");

-- One OPEN mentorship per (mentor, mentee). Partial on purpose: terminal rows are history and must not block
-- a fresh request. Direction matters: (A mentors B) and (B mentors A) are different pairs.
CREATE UNIQUE INDEX "uq_mentorship_open_pair" ON "mentorship"("mentor_id", "mentee_id")
  WHERE "state" IN ('REQUESTED', 'ACCEPTED', 'ACTIVE');

-- AddForeignKey
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship" ADD CONSTRAINT "mentorship_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mentorship"
  ADD CONSTRAINT "ck_mentorship_distinct" CHECK ("mentor_id" <> "mentee_id"),
  ADD CONSTRAINT "ck_mentorship_message" CHECK (char_length("message") BETWEEN 1 AND 500),
  ADD CONSTRAINT "ck_mentorship_note" CHECK ("response_note" IS NULL OR char_length("response_note") <= 500),
  ADD CONSTRAINT "ck_mentorship_topic" CHECK ("topic" IS NULL OR char_length("topic") BETWEEN 1 AND 40),
  -- Timestamp pairing. `state` is NOT NULL, so `NOT IN (...)` is never NULL here.
  ADD CONSTRAINT "ck_mentorship_responded" CHECK ("state" NOT IN ('ACCEPTED', 'ACTIVE', 'COMPLETED', 'DECLINED') OR "responded_at" IS NOT NULL),
  ADD CONSTRAINT "ck_mentorship_started" CHECK ("state" NOT IN ('ACTIVE', 'COMPLETED') OR "started_at" IS NOT NULL),
  ADD CONSTRAINT "ck_mentorship_ended" CHECK ("state" NOT IN ('COMPLETED', 'DECLINED', 'CANCELLED') OR "ended_at" IS NOT NULL),
  ADD CONSTRAINT "ck_mentorship_open_unended" CHECK ("state" NOT IN ('REQUESTED', 'ACCEPTED', 'ACTIVE') OR "ended_at" IS NULL);
