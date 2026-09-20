import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxStore } from "@nitap/database/outbox";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const KNOWN = ["email.send"];
const payload = { v: 1 };
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe("outbox store (real PostgreSQL)", () => {
  let db: TestDatabase;
  let store: ReturnType<typeof createOutboxStore>;

  beforeEach(async () => {
    db = await createTestDatabase();
    store = createOutboxStore(db.prisma);
  });
  afterEach(async () => {
    await db.drop();
  });

  const insert = (over: Record<string, unknown> = {}) =>
    db.prisma.outboxEvent.create({
      data: { type: "email.send", payload, ...over } as never,
    });

  it("claims the oldest unpublished rows first and marks the ones the publisher returns", async () => {
    const newer = await insert({ createdAt: minutesAgo(1) });
    const older = await insert({ createdAt: minutesAgo(5) });
    const seen: string[] = [];

    const claimed = await store.publishBatch(10, KNOWN, async (rows) => {
      seen.push(...rows.map((r) => r.id));
      return { published: rows.map((r) => r.id), quarantined: [] };
    });

    expect(claimed).toBe(2);
    expect(seen).toEqual([older.id, newer.id]);
    const after = await db.prisma.outboxEvent.findMany();
    expect(after.every((r) => r.publishedAt !== null)).toBe(true);
  });

  it("respects the batch limit", async () => {
    for (let i = 0; i < 5; i++) await insert({ createdAt: minutesAgo(10 - i) });
    const claimed = await store.publishBatch(2, KNOWN, async (rows) => ({
      published: rows.map((r) => r.id),
      quarantined: [],
    }));
    expect(claimed).toBe(2);
    expect(
      await db.prisma.outboxEvent.count({ where: { publishedAt: null } })
    ).toBe(3);
  });

  it("never claims a type this worker does not know; a newer worker still can", async () => {
    const unknown = await insert({ type: "future.thing" });
    const claimedByOld = await store.publishBatch(10, KNOWN, async () => {
      throw new Error("must not be called");
    });
    expect(claimedByOld).toBe(0);

    const claimedByNew = await store.publishBatch(
      10,
      ["future.thing"],
      async (rows) => ({
        published: rows.map((r) => r.id),
        quarantined: [],
      })
    );
    expect(claimedByNew).toBe(1);
    expect(
      (
        await db.prisma.outboxEvent.findUniqueOrThrow({
          where: { id: unknown.id },
        })
      ).publishedAt
    ).not.toBeNull();
  });

  it("commits nothing when the publisher throws (e.g. Redis was down)", async () => {
    await insert();
    await expect(
      store.publishBatch(10, KNOWN, async () => {
        throw new Error("redis unreachable");
      })
    ).rejects.toThrow("redis unreachable");
    expect(
      await db.prisma.outboxEvent.count({ where: { publishedAt: null } })
    ).toBe(1);
  });

  it("leaves rows the publisher neither published nor quarantined unpublished", async () => {
    const row = await insert();
    await store.publishBatch(10, KNOWN, async () => ({
      published: [],
      quarantined: [],
    }));
    expect(
      (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } }))
        .publishedAt
    ).toBeNull();
  });

  it("quarantines a poison row with its reason, and later batches skip it", async () => {
    const poison = await insert();
    await store.publishBatch(10, KNOWN, async () => ({
      published: [],
      quarantined: [
        { id: poison.id, reason: "invalid payload for email.send" },
      ],
    }));

    const row = await db.prisma.outboxEvent.findUniqueOrThrow({
      where: { id: poison.id },
    });
    expect(row.failedAt).not.toBeNull();
    expect(row.failureReason).toBe("invalid payload for email.send");

    const claimed = await store.publishBatch(10, KNOWN, async () => {
      throw new Error("must not be called");
    });
    expect(claimed).toBe(0);
  });

  it("two relays running at once never claim the same row (SKIP LOCKED)", async () => {
    for (let i = 0; i < 10; i++)
      await insert({ createdAt: minutesAgo(20 - i) });
    const claimedBy: string[][] = [[], []];
    const run = (index: number) =>
      store.publishBatch(10, KNOWN, async (rows) => {
        claimedBy[index]?.push(...rows.map((r) => r.id));
        await new Promise((resolve) => setTimeout(resolve, 200)); // hold the locks
        return { published: rows.map((r) => r.id), quarantined: [] };
      });

    await Promise.all([run(0), run(1)]);

    const all = [...(claimedBy[0] ?? []), ...(claimedBy[1] ?? [])];
    expect(new Set(all).size).toBe(all.length); // no row claimed twice
    expect(all).toHaveLength(10);
  });

  it("reports the age of the oldest unpublished row, ignoring published and quarantined ones", async () => {
    expect(await store.oldestUnpublishedAgeSeconds()).toBeNull();
    await insert({ createdAt: minutesAgo(30), publishedAt: minutesAgo(29) });
    await insert({
      createdAt: minutesAgo(40),
      failedAt: minutesAgo(39),
      failureReason: "x",
    });
    expect(await store.oldestUnpublishedAgeSeconds()).toBeNull();

    await insert({ createdAt: minutesAgo(10) });
    await insert({ createdAt: minutesAgo(2) });
    const age = await store.oldestUnpublishedAgeSeconds();
    expect(age).toBeGreaterThan(9 * 60);
    expect(age).toBeLessThan(11 * 60);
  });

  it("prunes only rows published before the cutoff, at most `limit` per call", async () => {
    for (let i = 0; i < 3; i++) {
      await insert({ publishedAt: minutesAgo(60 * 24 * 8 + i) });
    }
    await insert({ publishedAt: minutesAgo(5) }); // recent: kept
    await insert(); // unpublished: kept
    const cutoff = minutesAgo(60 * 24 * 7);

    expect(await store.pruneBefore(cutoff, 2)).toBe(2);
    expect(await store.pruneBefore(cutoff, 2)).toBe(1);
    expect(await store.pruneBefore(cutoff, 2)).toBe(0);
    expect(await db.prisma.outboxEvent.count()).toBe(2);
  });

  it("lists and releases quarantined rows", async () => {
    const a = await insert({ failedAt: minutesAgo(3), failureReason: "bad a" });
    await insert({ failedAt: minutesAgo(2), failureReason: "bad b" });

    const listed = await store.listQuarantined(10);
    expect(listed.map((r) => r.failureReason)).toEqual(["bad a", "bad b"]);

    expect(await store.releaseQuarantined([a.id])).toBe(1);
    expect(
      (await store.listQuarantined(10)).map((r) => r.failureReason)
    ).toEqual(["bad b"]);
    expect(await store.releaseQuarantined()).toBe(1);
    expect(await store.listQuarantined(10)).toEqual([]);
    expect(
      await db.prisma.outboxEvent.count({
        where: { failedAt: null, publishedAt: null },
      })
    ).toBe(2);
  });

  it("counts and replays published rows since a time, optionally by type", async () => {
    await insert({ publishedAt: minutesAgo(10) });
    await insert({ publishedAt: minutesAgo(10), type: "other.thing" });
    await insert({ publishedAt: minutesAgo(600) });
    const since = minutesAgo(60);

    expect(await store.countReplayable(since)).toBe(2);
    expect(await store.countReplayable(since, "email.send")).toBe(1);

    expect(await store.replay(since, "email.send")).toBe(1);
    expect(
      await db.prisma.outboxEvent.count({ where: { publishedAt: null } })
    ).toBe(1);
  });
});
