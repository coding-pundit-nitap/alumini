-- Phase 10 "edit own post": the feed marks an edited post. Nullable, no default: an expand-only change.
ALTER TABLE "post" ADD COLUMN "edited_at" TIMESTAMPTZ(3);
