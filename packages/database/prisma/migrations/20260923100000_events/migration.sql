-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventRegistrationState" AS ENUM ('REGISTERED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizer_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "location" TEXT,
    "is_online" BOOLEAN NOT NULL,
    "capacity" INTEGER NOT NULL,
    "registered_count" INTEGER NOT NULL DEFAULT 0,
    "registration_deadline" TIMESTAMPTZ(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state" "EventRegistrationState" NOT NULL DEFAULT 'REGISTERED',
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_event_upcoming" ON "event"("status", "starts_at", "id");

-- CreateIndex
CREATE INDEX "ix_event_organizer" ON "event"("organizer_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_event_registration_event" ON "event_registration"("event_id", "state");

-- One registration row per (user, event), forever: a re-registration after a cancel reuses it (spec E-4).
-- Also the index behind "my registrations" and the ALREADY_REGISTERED race (spec E-7).
CREATE UNIQUE INDEX "uq_event_registration" ON "event_registration"("user_id", "event_id");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants no writer may break (spec E-9). `ck_event_registered_count` is the database backstop for the
-- guarded counter (SRS §37–38, TDS §17): even a buggy writer cannot oversell.
ALTER TABLE "event"
  ADD CONSTRAINT "ck_event_title" CHECK (char_length("title") BETWEEN 3 AND 150),
  ADD CONSTRAINT "ck_event_description" CHECK (char_length("description") BETWEEN 10 AND 10000),
  ADD CONSTRAINT "ck_event_location" CHECK ("is_online" OR "location" IS NOT NULL),
  ADD CONSTRAINT "ck_event_location_length" CHECK ("location" IS NULL OR char_length("location") BETWEEN 1 AND 200),
  ADD CONSTRAINT "ck_event_timezone" CHECK (char_length("timezone") BETWEEN 1 AND 64),
  ADD CONSTRAINT "ck_event_capacity" CHECK ("capacity" BETWEEN 1 AND 100000),
  ADD CONSTRAINT "ck_event_registered_count" CHECK ("registered_count" BETWEEN 0 AND "capacity"),
  ADD CONSTRAINT "ck_event_deadline" CHECK ("registration_deadline" <= "starts_at"),
  -- `status` is NOT NULL, so the comparison is never NULL.
  ADD CONSTRAINT "ck_event_cancelled" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
