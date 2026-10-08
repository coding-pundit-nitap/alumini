-- Phase 11 is the first consumer of job.* outbox events. Every job.* row still unpublished at deploy
-- was written since Phase 7 with no consumer; publishing them now would send posters and moderators
-- stale notifications. Mark them published (the column the relay claims on), preserving the old no-op.
-- Cost: a job.* event in flight at deploy produces no notification.
UPDATE "outbox_event"
SET "published_at" = now()
WHERE "published_at" IS NULL
  AND "failed_at" IS NULL
  AND "type" LIKE 'job.%';
