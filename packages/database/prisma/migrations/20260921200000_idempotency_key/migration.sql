-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "idempotency_key" (
    "user_id" UUID NOT NULL,
    "idem_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_idempotency_key" PRIMARY KEY ("user_id","idem_key")
);

-- CreateIndex
CREATE INDEX "ix_idempotency_created" ON "idempotency_key"("created_at");

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A stored response exists exactly when the request finished; the key is bounded (the API accepts UUIDs).
ALTER TABLE "idempotency_key"
  ADD CONSTRAINT "ck_idempotency_response" CHECK (("state" = 'DONE') = ("response" IS NOT NULL)),
  ADD CONSTRAINT "ck_idempotency_key_length" CHECK (char_length("idem_key") BETWEEN 1 AND 64);
