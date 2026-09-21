-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ReportTargetType" AS ENUM ('POST', 'USER', 'MESSAGE', 'COMMENT');

-- CreateTable
CREATE TABLE "conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by_id" UUID NOT NULL,
    "is_group" BOOLEAN NOT NULL,
    "title" TEXT,
    "direct_pair_key" TEXT,
    "last_message_seq" BIGINT NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_participant" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_seq" BIGINT NOT NULL DEFAULT 0,
    "unread_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pk_conversation_participant" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE TABLE "message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seq" BIGSERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "client_message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_conversation_direct_pair" ON "conversation"("direct_pair_key");
CREATE INDEX "ix_conversation_participant_user" ON "conversation_participant"("user_id");
CREATE UNIQUE INDEX "uq_message_seq" ON "message"("seq");
CREATE UNIQUE INDEX "uq_message_client_id" ON "message"("conversation_id", "sender_id", "client_message_id");
CREATE INDEX "ix_message_conversation_seq" ON "message"("conversation_id", "seq" DESC);
CREATE UNIQUE INDEX "uq_report_once" ON "report"("reporter_id", "target_type", "target_id");
CREATE INDEX "ix_report_status" ON "report"("status", "created_at");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report" ADD CONSTRAINT "report_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity that Prisma cannot express. A pair key exists exactly for 1:1 conversations.
ALTER TABLE "conversation"
  ADD CONSTRAINT "ck_conversation_direct_key" CHECK (("is_group" AND "direct_pair_key" IS NULL) OR (NOT "is_group" AND "direct_pair_key" IS NOT NULL)),
  ADD CONSTRAINT "ck_conversation_title" CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 80),
  ADD CONSTRAINT "ck_conversation_last_message" CHECK ("last_message_seq" >= 0);

ALTER TABLE "conversation_participant"
  ADD CONSTRAINT "ck_participant_counters" CHECK ("unread_count" >= 0 AND "last_read_seq" >= 0);

ALTER TABLE "message"
  ADD CONSTRAINT "ck_message_body" CHECK (char_length("body") BETWEEN 1 AND 4000);

ALTER TABLE "report"
  ADD CONSTRAINT "ck_report_reason" CHECK (char_length("reason") BETWEEN 1 AND 1000),
  -- `status` is NOT NULL, so `NOT IN (...)` is never NULL here.
  ADD CONSTRAINT "ck_report_resolved" CHECK ("status" NOT IN ('RESOLVED', 'DISMISSED') OR "resolved_by_id" IS NOT NULL);
