-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- Persistent invariants live in the database (architectural rule). Prisma's schema language
-- cannot express CHECK constraints or partial indexes, so they are hand-written here.
ALTER TABLE "outbox_event"
  ADD CONSTRAINT ck_outbox_type CHECK (char_length("type") BETWEEN 1 AND 100);

ALTER TABLE "outbox_event"
  ADD CONSTRAINT ck_outbox_payload_object CHECK (jsonb_typeof("payload") = 'object');

-- A row is published or quarantined, never both.
ALTER TABLE "outbox_event"
  ADD CONSTRAINT ck_outbox_published_xor_failed
  CHECK (NOT ("published_at" IS NOT NULL AND "failed_at" IS NOT NULL));

-- A quarantined row always says why, and only quarantined rows have a reason.
ALTER TABLE "outbox_event"
  ADD CONSTRAINT ck_outbox_failure_reason
  CHECK (("failed_at" IS NULL) = ("failure_reason" IS NULL));

-- The relay scans only rows that still need publishing; the pruner scans only published ones.
CREATE INDEX ix_outbox_unpublished ON "outbox_event" ("created_at")
  WHERE "published_at" IS NULL AND "failed_at" IS NULL;
CREATE INDEX ix_outbox_published ON "outbox_event" ("published_at")
  WHERE "published_at" IS NOT NULL;
