import { createHash } from "node:crypto";

import { createIdempotencyStore } from "@nitap/database/idempotency";

import { prisma } from "@/infrastructure/database/client";
import { ValidationError } from "@/lib/errors";

import {
  createIdempotency,
  type IdempotencyPort,
  type RunIdempotently,
  type StoredResponse,
} from "./idempotency";

const store = createIdempotencyStore();

const port: IdempotencyPort = {
  claim: (input) => store.claim(prisma, input),
  find: (userId, key) => store.find(prisma, userId, key),
  complete: (userId, key, response) =>
    store.complete(prisma, userId, key, response),
  release: (userId, key) => store.release(prisma, userId, key),
  reclaim: (userId, key, before) => store.reclaim(prisma, userId, key, before),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs a Route Handler's work under the request's `Idempotency-Key`, if it sent one. Without a key, or with
 * no signed-in user to scope it to, the work simply runs (the database invariants still hold). The request
 * fingerprint is the method, path and raw body, so the same key with a different request is refused.
 */
export async function respondIdempotently(
  request: Request,
  args: {
    userId: string | null;
    rawBody: string;
    execute: () => Promise<StoredResponse>;
    /** Injectable for tests. */
    run?: RunIdempotently;
  }
): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (key === null || args.userId === null) {
    return toResponse(await args.execute(), false);
  }
  if (!UUID.test(key)) {
    throw new ValidationError({
      details: [
        {
          field: "Idempotency-Key",
          code: "INVALID",
          message: "Send the key as a UUID.",
        },
      ],
    });
  }

  const requestHash = createHash("sha256")
    .update(
      `${request.method} ${new URL(request.url).pathname}\n${args.rawBody}`
    )
    .digest("hex");
  const run = args.run ?? createIdempotency({ port });
  const { response, replayed } = await run({
    userId: args.userId,
    key: key.toLowerCase(),
    requestHash,
    execute: args.execute,
  });
  return toResponse(response, replayed);
}

function toResponse(stored: StoredResponse, replayed: boolean): Response {
  const headers = new Headers(stored.headers);
  if (replayed) headers.set("Idempotent-Replay", "true");
  return Response.json(stored.body, { status: stored.status, headers });
}
