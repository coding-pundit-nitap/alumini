import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createIdempotencyStore } from "@nitap/database/idempotency";
import { createOutboxWriter } from "@nitap/database/outbox";
import { createAuditWriter } from "@nitap/database/audit";
import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

import { createIdempotency } from "@/infrastructure/idempotency/idempotency";
import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createRequestConnection } from "@/modules/connections/application/request-connection";
import { createPrismaConnectionStore } from "@/modules/connections/infrastructure/prisma-connection-store";

const KEY = "11111111-1111-4111-8111-111111111111";
const response = {
  status: 201,
  body: { ok: true },
  headers: { Location: "/x" },
};

describe("idempotency keys against real PostgreSQL", () => {
  let db: TestDatabase;
  let userId: string;
  const store = createIdempotencyStore();

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    userId = (
      await db.prisma.user.create({
        data: { name: "A", email: "a@example.test" },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const port = () => ({
    claim: (i: { userId: string; key: string; requestHash: string }) =>
      store.claim(db.prisma, i),
    find: (u: string, k: string) => store.find(db.prisma, u, k),
    complete: (u: string, k: string, r: typeof response) =>
      store.complete(db.prisma, u, k, r),
    release: (u: string, k: string) => store.release(db.prisma, u, k),
    reclaim: (u: string, k: string, b: Date) =>
      store.reclaim(db.prisma, u, k, b),
  });

  it("eight simultaneous claims of one key: exactly one wins", async () => {
    const wins = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.claim(db.prisma, { userId, key: KEY, requestHash: "h" })
      )
    );
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await db.prisma.idempotencyKey.count()).toBe(1);
  });

  it("stores and replays a response through the real port, and only DONE rows carry one", async () => {
    const run = createIdempotency({ port: port() });
    const a = await run({
      userId,
      key: KEY,
      requestHash: "h",
      execute: async () => response,
    });
    const b = await run({
      userId,
      key: KEY,
      requestHash: "h",
      execute: async () => {
        throw new Error("must not run");
      },
    });
    expect(a).toEqual({ response, replayed: false });
    expect(b).toEqual({ response, replayed: true });
    expect(
      await db.prisma.idempotencyKey.findUniqueOrThrow({
        where: { userId_key: { userId, key: KEY } },
      })
    ).toMatchObject({
      state: "DONE",
      response,
    });
  });

  it("the same key on POST /connections twice creates ONE connection and ONE event; the second call replays it", async () => {
    const other = (
      await db.prisma.user.create({
        data: { name: "B", email: "b@example.test", accountState: "VERIFIED" },
      })
    ).id;
    const request = createRequestConnection({
      store: createPrismaConnectionStore({
        runner: createTransactionRunner(db.prisma),
        outbox: createOutboxWriter(),
        audit: createAuditWriter(),
      }),
      authorize: (a: Actor | null) => {
        if (!a) throw new AuthenticationError();
        return a;
      },
      rateLimiter: {
        consume: async () => ({ allowed: true, retryAfter: null }),
      },
    });
    const actor: Actor = {
      userId,
      accountState: "VERIFIED",
      requestId: "r",
      grants: [],
    };
    const run = createIdempotency({ port: port() });
    let executions = 0;
    const call = () =>
      run({
        userId,
        key: KEY,
        requestHash: "same",
        execute: async () => {
          executions += 1;
          const { connectionId } = await request({ actor, recipientId: other });
          return { status: 201, body: { id: connectionId }, headers: {} };
        },
      });

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        call().then(
          (r) => r,
          (e: { code: string }) => e.code
        )
      )
    );
    // Whether a retry replayed or arrived mid-flight, there is one connection, one event, one execution.
    expect(executions).toBe(1);
    expect(await db.prisma.connection.count()).toBe(1);
    expect(await db.prisma.outboxEvent.count()).toBe(1);
    expect(
      results
        .filter((r) => typeof r === "string")
        .every((c) => c === "REQUEST_IN_PROGRESS")
    ).toBe(true);
    const replay = await call();
    expect(replay.replayed).toBe(true);
    expect(await db.prisma.connection.count()).toBe(1);
  });

  it("refuses a DONE row without a response and a response on an unfinished row (ck_idempotency_response)", async () => {
    const bad = (data: Record<string, unknown>) =>
      db.prisma.idempotencyKey
        .create({
          data: { userId, key: "x", requestHash: "h", ...data } as never,
        })
        .catch((e) => e);
    expectConstraintViolation(
      await bad({ state: "DONE" }),
      "ck_idempotency_response"
    );
    expectConstraintViolation(
      await bad({ state: "IN_PROGRESS", response }),
      "ck_idempotency_response"
    );
  });

  it("bounds the key length (ck_idempotency_key_length)", async () => {
    const error = await db.prisma.idempotencyKey
      .create({ data: { userId, key: "k".repeat(65), requestHash: "h" } })
      .catch((e) => e);
    expectConstraintViolation(error, "ck_idempotency_key_length");
  });

  it("reclaims only rows older than the cutoff", async () => {
    await store.claim(db.prisma, { userId, key: KEY, requestHash: "h" });
    expect(
      await store.reclaim(db.prisma, userId, KEY, new Date(Date.now() - 60_000))
    ).toBe(false);
    await db.prisma.idempotencyKey.updateMany({
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    expect(
      await store.reclaim(db.prisma, userId, KEY, new Date(Date.now() - 60_000))
    ).toBe(true);
    expect(await db.prisma.idempotencyKey.count()).toBe(0);
  });

  it("the sweep deletes only rows past the cutoff, at most `limit` per call", async () => {
    for (let i = 0; i < 5; i += 1) {
      await db.prisma.idempotencyKey.create({
        data: {
          userId,
          key: `old-${i}`,
          requestHash: "h",
          createdAt: new Date(Date.now() - 2 * 86_400_000),
        },
      });
    }
    await db.prisma.idempotencyKey.create({
      data: { userId, key: "fresh", requestHash: "h" },
    });
    const cutoff = new Date(Date.now() - 86_400_000);
    expect(await store.sweep(db.prisma, cutoff, 3)).toBe(3);
    expect(await store.sweep(db.prisma, cutoff, 3)).toBe(2);
    expect(await store.sweep(db.prisma, cutoff, 3)).toBe(0);
    expect(
      (await db.prisma.idempotencyKey.findMany()).map((r) => r.key)
    ).toEqual(["fresh"]);
  });

  it("deletes a member's keys with the member", async () => {
    await store.claim(db.prisma, { userId, key: KEY, requestHash: "h" });
    await db.prisma.user.delete({ where: { id: userId } });
    expect(await db.prisma.idempotencyKey.count()).toBe(0);
  });
});
