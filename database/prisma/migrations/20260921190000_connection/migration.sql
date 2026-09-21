-- CreateEnum
CREATE TYPE "ConnectionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');

-- CreateTable
CREATE TABLE "connection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "blocked_by_id" UUID,
    "state" "ConnectionState" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_connection_pair" ON "connection"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "ix_connection_user_a" ON "connection"("user_a_id", "state");

-- CreateIndex
CREATE INDEX "ix_connection_user_b" ON "connection"("user_b_id", "state");

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_blocked_by_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per unordered pair: the canonical order makes the unique index catch A->B and B->A alike, and a
-- user can never connect to themselves (a_id < b_id excludes equality). The application canonicalises;
-- these CHECKs are the backstop (domain-model §3).
ALTER TABLE "connection"
  ADD CONSTRAINT "ck_connection_order" CHECK ("user_a_id" < "user_b_id"),
  ADD CONSTRAINT "ck_connection_requester" CHECK ("requested_by_id" IN ("user_a_id", "user_b_id")),
  -- Explicit IS NOT NULL: `NULL IN (...)` is NULL and a CHECK passes on NULL, so a BLOCKED row without a
  -- blocker would otherwise slip through (the domain-model §3 draft of this CHECK has that hole).
  ADD CONSTRAINT "ck_connection_blocker" CHECK (
    ("state" = 'BLOCKED' AND "blocked_by_id" IS NOT NULL AND "blocked_by_id" IN ("user_a_id", "user_b_id"))
    OR ("state" <> 'BLOCKED' AND "blocked_by_id" IS NULL)
  ),
  -- The re-request cooldown is computed from responded_at, so a REJECTED row must carry it.
  ADD CONSTRAINT "ck_connection_responded" CHECK ("state" NOT IN ('ACCEPTED', 'REJECTED') OR "responded_at" IS NOT NULL);
