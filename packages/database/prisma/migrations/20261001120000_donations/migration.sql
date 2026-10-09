-- Phase 12H: offline fundraising (overview XD-6, XD-7; spec H-1). Money is integer paise.
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "DonationStatus" AS ENUM ('PLEDGED', 'CONFIRMED', 'NOT_RECEIVED', 'CANCELLED');

CREATE TABLE "donation_campaign" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payment_instructions" TEXT NOT NULL,
    "goal_paise" BIGINT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "donation_campaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_campaign_title" CHECK (char_length("title") BETWEEN 3 AND 150),
    CONSTRAINT "ck_campaign_description" CHECK (char_length("description") BETWEEN 10 AND 5000),
    CONSTRAINT "ck_campaign_purpose" CHECK (char_length("purpose") BETWEEN 1 AND 200),
    CONSTRAINT "ck_campaign_instructions" CHECK (char_length("payment_instructions") BETWEEN 10 AND 2000),
    CONSTRAINT "ck_campaign_goal" CHECK ("goal_paise" IS NULL OR "goal_paise" > 0),
    CONSTRAINT "ck_campaign_dates" CHECK ("ends_on" >= "starts_on")
);

CREATE TABLE "donation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "donor_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "payment_reference" TEXT,
    "status" "DonationStatus" NOT NULL DEFAULT 'PLEDGED',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "donation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_donation_amount" CHECK ("amount_paise" BETWEEN 1000 AND 100000000),
    CONSTRAINT "ck_donation_reference" CHECK ("payment_reference" IS NULL OR "payment_reference" ~ '^[A-Z0-9/-]{4,64}$'),
    CONSTRAINT "ck_donation_note" CHECK ("note" IS NULL OR char_length("note") <= 500),
    -- Decided exactly when CONFIRMED or NOT_RECEIVED; a confirmation always names its manager and reference.
    CONSTRAINT "ck_donation_decided" CHECK (("status" IN ('CONFIRMED', 'NOT_RECEIVED')) = ("decided_at" IS NOT NULL)),
    CONSTRAINT "ck_donation_confirmed" CHECK ("status" <> 'CONFIRMED' OR ("decided_by" IS NOT NULL AND "payment_reference" IS NOT NULL)),
    -- Only the expiry sweep (spec H-8) decides without a person.
    CONSTRAINT "ck_donation_decider" CHECK ("status" <> 'NOT_RECEIVED' OR "decided_by" IS NOT NULL OR "note" = 'expired')
);

CREATE INDEX "ix_campaign_status" ON "donation_campaign"("status", "ends_on");
CREATE UNIQUE INDEX "uq_donation_reference" ON "donation"("campaign_id", "payment_reference");
CREATE INDEX "ix_donation_status" ON "donation"("status", "created_at");
CREATE INDEX "ix_donation_donor" ON "donation"("donor_id", "created_at");
CREATE INDEX "ix_donation_campaign" ON "donation"("campaign_id", "status");

ALTER TABLE "donation_campaign" ADD CONSTRAINT "donation_campaign_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donation" ADD CONSTRAINT "donation_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "donation_campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donation" ADD CONSTRAINT "donation_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donation" ADD CONSTRAINT "donation_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
