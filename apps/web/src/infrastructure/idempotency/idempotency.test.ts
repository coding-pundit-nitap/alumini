import { describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

import {
  createIdempotency,
  IDEMPOTENCY_TTL_MS,
  IN_PROGRESS_STALE_MS,
  type IdempotencyPort,
  type StoredResponse,
} from "./idempotency";

type Row = {
  requestHash: string;
  state: "IN_PROGRESS" | "DONE";
  response: StoredResponse | null;
  createdAt: Date;
};

/** In-memory port. `claim` is atomic like the database's ON CONFLICT DO NOTHING. */
function fakePort(clock: { now: Date }) {
  const rows = new Map<string, Row>();
  const id = (u: string, k: string) => `${u}|${k}`;
  const port: IdempotencyPort = {
    async claim({ userId, key, requestHash }) {
      if (rows.has(id(userId, key))) return false;
      rows.set(id(userId, key), {
        requestHash,
        state: "IN_PROGRESS",
        response: null,
        createdAt: clock.now,
      });
      return true;
    },
    async find(userId, key) {
      return rows.get(id(userId, key)) ?? null;
    },
    async complete(userId, key, response) {
      const row = rows.get(id(userId, key));
      if (row) Object.assign(row, { state: "DONE", response });
    },
    async release(userId, key) {
      rows.delete(id(userId, key));
    },
    async reclaim(userId, key, before) {
      const row = rows.get(id(userId, key));
      if (!row || row.createdAt >= before) return false;
      rows.delete(id(userId, key));
      return true;
    },
  };
  return { port, rows };
}

const created: StoredResponse = {
  status: 201,
  body: { data: { id: "c1" } },
  headers: { Location: "/api/v1/connections/c1" },
};
const args = (
  over: Partial<Parameters<ReturnType<typeof createIdempotency>>[0]> = {}
) => ({
  userId: "u1",
  key: "k1",
  requestHash: "h1",
  execute: vi.fn(async () => created),
  ...over,
});
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code
  );

describe("idempotency (API spec §1.6)", () => {
  it("first request: runs, stores the response, and is not a replay", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const { port, rows } = fakePort(clock);
    const a = args();
    const result = await createIdempotency({ port, now: () => clock.now })(a);
    expect(result).toEqual({ response: created, replayed: false });
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(rows.get("u1|k1")).toMatchObject({
      state: "DONE",
      response: created,
    });
  });

  it("same key and same request: replays the stored response without running again", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    await run(args());
    const second = args();
    expect(await run(second)).toEqual({ response: created, replayed: true });
    expect(second.execute).not.toHaveBeenCalled();
  });

  it("same key, different request: IDEMPOTENCY_KEY_REUSED", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    await run(args());
    const other = args({ requestHash: "h2" });
    expect(await code(run(other))).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(other.execute).not.toHaveBeenCalled();
  });

  it("scopes keys per user: another member's identical key is a fresh request", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    await run(args());
    const theirs = args({ userId: "u2" });
    expect((await run(theirs)).replayed).toBe(false);
    expect(theirs.execute).toHaveBeenCalledTimes(1);
  });

  it("a repeat while the first is still running: REQUEST_IN_PROGRESS, and it does not run", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    let finish!: (r: StoredResponse) => void;
    const slow = args({
      execute: () => new Promise<StoredResponse>((r) => (finish = r)),
    });
    const first = run(slow);
    await Promise.resolve();
    const repeat = args();
    expect(await code(run(repeat))).toBe("REQUEST_IN_PROGRESS");
    expect(repeat.execute).not.toHaveBeenCalled();
    finish(created);
    expect((await first).replayed).toBe(false);
  });

  it("eight concurrent identical requests execute exactly once; the rest replay or are told in-progress", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    const execute = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return created;
    });
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        run(args({ execute })).then(
          (r) => (r.replayed ? "replay" : "ran"),
          (e: ConflictError) => e.code
        )
      )
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((o) => o === "ran")).toHaveLength(1);
    expect(
      outcomes.every((o) =>
        ["ran", "replay", "REQUEST_IN_PROGRESS"].includes(o as string)
      )
    ).toBe(true);
  });

  it("a failure releases the claim, so a retry with the same key runs again", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const { port, rows } = fakePort(clock);
    const run = createIdempotency({ port, now: () => clock.now });
    await expect(
      run(
        args({
          execute: async () => {
            throw new Error("boom");
          },
        })
      )
    ).rejects.toThrow("boom");
    expect(rows.size).toBe(0);
    const retry = args();
    expect((await run(retry)).replayed).toBe(false);
    expect(retry.execute).toHaveBeenCalledTimes(1);
  });

  it("does not store a non-2xx response: it is released and recomputed on retry", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const { port, rows } = fakePort(clock);
    const run = createIdempotency({ port, now: () => clock.now });
    const refused: StoredResponse = { status: 409, body: {}, headers: {} };
    expect((await run(args({ execute: async () => refused }))).response).toBe(
      refused
    );
    expect(rows.size).toBe(0);
  });

  it("takes over a claim abandoned by a dead request once it is stale", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const { port, rows } = fakePort(clock);
    const run = createIdempotency({ port, now: () => clock.now });
    await port.claim({ userId: "u1", key: "k1", requestHash: "h1" }); // a crashed request
    expect(await code(run(args()))).toBe("REQUEST_IN_PROGRESS");

    clock.now = new Date(clock.now.getTime() + IN_PROGRESS_STALE_MS + 1);
    const retry = args();
    expect((await run(retry)).replayed).toBe(false);
    expect(retry.execute).toHaveBeenCalledTimes(1);
    expect(rows.get("u1|k1")?.state).toBe("DONE");
  });

  it("treats a stored reply older than 24 h as absent: the request runs again", async () => {
    const clock = { now: new Date("2026-09-21T10:00:00Z") };
    const run = createIdempotency({
      port: fakePort(clock).port,
      now: () => clock.now,
    });
    await run(args());
    clock.now = new Date(clock.now.getTime() + IDEMPOTENCY_TTL_MS + 1);
    const again = args({ requestHash: "different-now-that-it-expired" });
    expect((await run(again)).replayed).toBe(false);
    expect(again.execute).toHaveBeenCalledTimes(1);
  });
});
