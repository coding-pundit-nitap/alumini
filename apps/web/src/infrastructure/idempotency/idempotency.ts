import type { StoredResponse } from "@nitap/database/idempotency";

import { ConflictError } from "@/lib/errors";

export type { StoredResponse };

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** A claim this old with no reply belongs to a request that died; a retry may take it over. */
export const IN_PROGRESS_STALE_MS = 60 * 1000;

/** The persistence port; `@nitap/database/idempotency` implements it with Prisma. */
export type IdempotencyPort = {
  claim(input: {
    userId: string;
    key: string;
    requestHash: string;
  }): Promise<boolean>;
  find(
    userId: string,
    key: string
  ): Promise<{
    requestHash: string;
    state: "IN_PROGRESS" | "DONE";
    response: StoredResponse | null;
    createdAt: Date;
  } | null>;
  complete(
    userId: string,
    key: string,
    response: StoredResponse
  ): Promise<void>;
  release(userId: string, key: string): Promise<void>;
  reclaim(userId: string, key: string, before: Date): Promise<boolean>;
};

/**
 * `Idempotency-Key` handling per user and key: a repeat of the same request replays the stored
 * response, a different request is IDEMPOTENCY_KEY_REUSED, and an in-flight one is REQUEST_IN_PROGRESS.
 * Only 2xx responses are stored. Database constraints remain the real guarantee.
 */
export function createIdempotency(deps: {
  port: IdempotencyPort;
  now?: () => Date;
  ttlMs?: number;
  staleMs?: number;
}) {
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs ?? IDEMPOTENCY_TTL_MS;
  const staleMs = deps.staleMs ?? IN_PROGRESS_STALE_MS;

  return async function run(args: {
    userId: string;
    key: string;
    requestHash: string;
    execute: () => Promise<StoredResponse>;
  }): Promise<{ response: StoredResponse; replayed: boolean }> {
    const { userId, key, requestHash } = args;

    // Two passes at most: the first may find a dead or expired row, remove it, and claim on the second.
    for (let pass = 0; pass < 2; pass += 1) {
      if (await deps.port.claim({ userId, key, requestHash })) {
        let response: StoredResponse;
        try {
          response = await args.execute();
        } catch (error) {
          await deps.port.release(userId, key).catch(() => {});
          throw error;
        }
        if (response.status >= 200 && response.status < 300) {
          await deps.port.complete(userId, key, response);
        } else {
          await deps.port.release(userId, key).catch(() => {});
        }
        return { response, replayed: false };
      }

      const row = await deps.port.find(userId, key);
      if (!row) continue; // released between our claim and our read: claim again

      const age = now().getTime() - row.createdAt.getTime();
      const limit = row.state === "DONE" ? ttlMs : staleMs;
      if (age > limit) {
        await deps.port.reclaim(userId, key, new Date(now().getTime() - limit));
        continue;
      }

      if (row.requestHash !== requestHash) {
        throw new ConflictError("IDEMPOTENCY_KEY_REUSED");
      }
      if (row.state === "DONE" && row.response) {
        return { response: row.response, replayed: true };
      }
      throw new ConflictError("REQUEST_IN_PROGRESS");
    }
    throw new ConflictError("REQUEST_IN_PROGRESS");
  };
}

export type RunIdempotently = ReturnType<typeof createIdempotency>;
