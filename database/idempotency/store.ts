import type { Prisma } from "../generated/prisma/client.ts";

/** A response as stored: enough to replay it byte-for-byte in meaning (status, JSON body, a few headers). */
export type StoredResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

export type IdempotencyRow = {
  requestHash: string;
  state: "IN_PROGRESS" | "DONE";
  response: StoredResponse | null;
  createdAt: Date;
};

/** Only the delegate (and raw SQL for the bounded sweep) is needed, so this works with any client. */
export type IdempotencyClient = Pick<
  Prisma.TransactionClient,
  "idempotencyKey" | "$executeRaw"
>;

/**
 * Shared between the web app (claims and replays, on the request path) and the worker (the daily sweep),
 * the same relationship `@nitap/database/uploads` has to both. A claim MUST commit on its own, not inside
 * the business transaction, or a concurrent duplicate could never see it.
 */
export type IdempotencyStore = {
  /** True when this call created the claim (the caller runs the request); false when one already exists. */
  claim(
    db: IdempotencyClient,
    input: { userId: string; key: string; requestHash: string }
  ): Promise<boolean>;
  find(
    db: IdempotencyClient,
    userId: string,
    key: string
  ): Promise<IdempotencyRow | null>;
  complete(
    db: IdempotencyClient,
    userId: string,
    key: string,
    response: StoredResponse
  ): Promise<void>;
  /** Drops the claim so a retry can run the request again (used when the request did not succeed). */
  release(db: IdempotencyClient, userId: string, key: string): Promise<void>;
  /** Deletes the row only if it is older than `before` (an expired reply or an abandoned claim). */
  reclaim(
    db: IdempotencyClient,
    userId: string,
    key: string,
    before: Date
  ): Promise<boolean>;
  /** Deletes up to `limit` rows created before `before`; returns how many. */
  sweep(db: IdempotencyClient, before: Date, limit: number): Promise<number>;
};

export function createIdempotencyStore(): IdempotencyStore {
  return {
    async claim(db, { userId, key, requestHash }) {
      const { count } = await db.idempotencyKey.createMany({
        data: [{ userId, key, requestHash }],
        skipDuplicates: true,
      });
      return count === 1;
    },

    async find(db, userId, key) {
      const row = await db.idempotencyKey.findUnique({
        where: { userId_key: { userId, key } },
      });
      return row
        ? {
            requestHash: row.requestHash,
            state: row.state,
            response: row.response as StoredResponse | null,
            createdAt: row.createdAt,
          }
        : null;
    },

    async complete(db, userId, key, response) {
      await db.idempotencyKey.updateMany({
        where: { userId, key, state: "IN_PROGRESS" },
        data: { state: "DONE", response: response as Prisma.InputJsonValue },
      });
    },

    async release(db, userId, key) {
      await db.idempotencyKey.deleteMany({ where: { userId, key } });
    },

    async reclaim(db, userId, key, before) {
      const { count } = await db.idempotencyKey.deleteMany({
        where: { userId, key, createdAt: { lt: before } },
      });
      return count === 1;
    },

    async sweep(db, before, limit) {
      return db.$executeRaw`DELETE FROM idempotency_key WHERE ctid IN (
        SELECT ctid FROM idempotency_key WHERE created_at < ${before} LIMIT ${limit})`;
    },
  };
}
