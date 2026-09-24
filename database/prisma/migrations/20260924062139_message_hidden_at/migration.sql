-- 12C C12-4: a moderator hides a reported message by resolving its report. Reads return a tombstone;
-- seq, read markers and unread counters are untouched. Nullable, no default: no table rewrite.
ALTER TABLE "message" ADD COLUMN "hidden_at" TIMESTAMPTZ(3);
