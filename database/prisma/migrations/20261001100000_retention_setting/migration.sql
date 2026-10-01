-- Phase 12G: configurable retention periods (SRS §45). Rows are seeded from seed-data/retention.ts.
CREATE TABLE "retention_setting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "approved_by" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "retention_setting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_retention_days" CHECK ("retention_days" BETWEEN 1 AND 36500),
    CONSTRAINT "ck_retention_approved_by" CHECK ("approved_by" IS NULL OR char_length("approved_by") BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX "retention_setting_category_key" ON "retention_setting"("category");

ALTER TABLE "retention_setting" ADD CONSTRAINT "retention_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
