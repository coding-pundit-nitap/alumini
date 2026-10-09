-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CrossCheckResult" AS ENUM ('NOT_CHECKED', 'MATCH', 'MISMATCH');

-- CreateTable
CREATE TABLE "verification_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "roll_number" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "degree_id" UUID NOT NULL,
    "graduation_year" INTEGER NOT NULL,
    "supporting_info" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "cross_check" "CrossCheckResult" NOT NULL DEFAULT 'NOT_CHECKED',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_verification_queue" ON "verification_request"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "ix_verification_user_history" ON "verification_request"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_audit_target" ON "audit_log"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_audit_actor" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_audit_action" ON "audit_log"("action", "created_at");

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_degree_id_fkey" FOREIGN KEY ("degree_id") REFERENCES "degree"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_request" ADD CONSTRAINT "verification_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Persistent invariants live in the database (architectural rule). Prisma's schema language
-- cannot express CHECK constraints, partial indexes or triggers, so they are hand-written here.

-- verification_request ---------------------------------------------------------------------------
ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_roll_number
  CHECK (char_length("roll_number") BETWEEN 1 AND 50);

ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_supporting_info
  CHECK ("supporting_info" IS NULL OR char_length("supporting_info") <= 2000);

ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_review_note
  CHECK ("review_note" IS NULL OR char_length("review_note") <= 1000);

-- Static range, never date-dependent (same as ck_profile_graduation_year).
ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_graduation_year
  CHECK ("graduation_year" BETWEEN 2010 AND 2100);

-- A request is open exactly while it has no reviewer and no review time.
ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_pending_reviewer
  CHECK (("status" = 'PENDING') = ("reviewed_by" IS NULL AND "reviewed_at" IS NULL));

-- Separation of duties as a backstop to the application guardrail.
ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_reviewer_not_subject
  CHECK ("reviewed_by" IS NULL OR "reviewed_by" <> "user_id");

-- A rejection always says why.
ALTER TABLE "verification_request"
  ADD CONSTRAINT ck_verification_reject_note
  CHECK ("status" <> 'REJECTED' OR "review_note" IS NOT NULL);

-- One open request per user (abuse prevention).
CREATE UNIQUE INDEX uq_verification_one_open
  ON "verification_request" ("user_id") WHERE "status" = 'PENDING';

-- audit_log --------------------------------------------------------------------------------------
ALTER TABLE "audit_log"
  ADD CONSTRAINT ck_audit_action CHECK (char_length("action") BETWEEN 1 AND 100);

ALTER TABLE "audit_log"
  ADD CONSTRAINT ck_audit_metadata_object CHECK (jsonb_typeof("metadata") = 'object');

-- Append-only, enforced by the database even against our own code. The separate
-- insert-only database role (migrator / runtime / audit writer) is planned; until
-- then this trigger is the guard.
CREATE FUNCTION audit_log_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER tr_audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER tr_audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();
