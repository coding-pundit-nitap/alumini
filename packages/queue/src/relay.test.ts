import { describe, expect, it, vi } from "vitest";

import type {
  JobDefinition,
  OutboxEventRow,
  OutboxStore,
  PublishResult,
} from "@nitap/jobs";
import { emailSend } from "@nitap/jobs";
import type { Logger, Metrics } from "@nitap/observability";

import type { QueuePort } from "./port.ts";
import { createRelay } from "./relay.ts";
import { TimeoutError } from "./timeout.ts";

const validPayload = {
  v: 1,
  to: "person@example.test",
  template: "existing-account",
  params: {},
};

/**
 * An in-memory outbox that behaves like the real transaction: nothing is
 * applied if the publisher throws.
 */
function fakeStore(initial: OutboxEventRow[]) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]));
  const published = new Set<string>();
  const quarantined = new Map<string, string>();
  const claimedTypes: string[][] = [];
  const store: OutboxStore = {
    async publishBatch(limit, knownTypes, publish) {
      claimedTypes.push([...knownTypes]);
      const batch = [...rows.values()]
        .filter(
          (r) =>
            !published.has(r.id) &&
            !quarantined.has(r.id) &&
            knownTypes.includes(r.type)
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit);
      if (batch.length === 0) return 0;
      const result: PublishResult = await publish(batch);
      result.published.forEach((id) => published.add(id));
      result.quarantined.forEach((q) => quarantined.set(q.id, q.reason));
      return batch.length;
    },
    async oldestUnpublishedAgeSeconds() {
      const open = [...rows.values()].filter(
        (r) => !published.has(r.id) && !quarantined.has(r.id)
      );
      return open.length ? 42 : null;
    },
    pruneBefore: async () => 0,
    listQuarantined: async () => [],
    releaseQuarantined: async () => 0,
    countReplayable: async () => 0,
    replay: async () => 0,
    countSettleable: async () => 0,
    settle: async () => 0,
  };
  return { store, published, quarantined, claimedTypes };
}

const row = (
  id: string,
  over: Partial<OutboxEventRow> = {}
): OutboxEventRow => ({
  id,
  type: "email.send",
  payload: validPayload,
  requestId: `req-${id}`,
  createdAt: new Date(Number(id) * 1000),
  ...over,
});

function fakeQueue(behaviour: { failFrom?: number; hang?: boolean } = {}) {
  const adds: Array<{
    job: JobDefinition;
    payload: unknown;
    jobId: string;
    requestId?: string | null;
  }> = [];
  const state = {
    failFrom: behaviour.failFrom ?? Infinity,
    hang: behaviour.hang ?? false,
  };
  const queue: QueuePort = {
    async add(job, payload, options) {
      if (state.hang) return new Promise<void>(() => {});
      if (adds.length >= state.failFrom) throw new Error("redis unreachable");
      adds.push({ job, payload, ...options });
    },
    upsertSchedule: async () => {},
    close: async () => {},
  };
  return { queue, adds, state };
}

const silentLogger = () =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }) as unknown as Logger;
const recordingMetrics = () =>
  ({
    increment: vi.fn(),
    observe: vi.fn(),
    gauge: vi.fn(),
  }) as unknown as Metrics & {
    increment: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  };

const relayWith = (
  over: Partial<Parameters<typeof createRelay>[0]> &
    Pick<Parameters<typeof createRelay>[0], "store" | "queue">
) =>
  createRelay({
    events: { "email.send": emailSend },
    logger: silentLogger(),
    metrics: recordingMetrics(),
    pollIntervalMs: 100,
    batchSize: 10,
    enqueueTimeoutMs: 1000,
    maxBackoffMs: 1000,
    ...over,
  });

describe("relay.runOnce", () => {
  it("enqueues each row with jobId = the outbox id and the request id, then marks it published", async () => {
    const { store, published, claimedTypes } = fakeStore([row("1"), row("2")]);
    const { queue, adds } = fakeQueue();

    const result = await relayWith({ store, queue }).runOnce();

    expect(result).toEqual({ claimed: 2, published: 2, quarantined: 0 });
    expect(adds.map((a) => [a.jobId, a.requestId])).toEqual([
      ["1", "req-1"],
      ["2", "req-2"],
    ]);
    expect(adds[0]?.job.name).toBe("email.send");
    expect([...published]).toEqual(["1", "2"]);
    expect(claimedTypes[0]).toEqual(["email.send"]); // only types this worker knows
  });

  it("quarantines an invalid payload without blocking the valid rows around it", async () => {
    const { store, published, quarantined } = fakeStore([
      row("1"),
      row("2", { payload: { ...validPayload, to: "not-an-email" } }),
      row("3"),
    ]);
    const { queue, adds } = fakeQueue();

    const result = await relayWith({ store, queue }).runOnce();

    expect(result).toEqual({ claimed: 3, published: 2, quarantined: 1 });
    expect(adds.map((a) => a.jobId)).toEqual(["1", "3"]);
    expect([...published]).toEqual(["1", "3"]);
    expect(quarantined.get("2")).toContain("email.send");
    expect(quarantined.get("2")).not.toContain("not-an-email");
  });

  it("rolls back the whole batch when the queue fails, then republishes with the same job ids", async () => {
    const { store, published } = fakeStore([row("1"), row("2"), row("3")]);
    const { queue, adds, state } = fakeQueue({ failFrom: 1 }); // row 1 enqueues, row 2 fails

    const relay = relayWith({ store, queue });
    await expect(relay.runOnce()).rejects.toThrow("redis unreachable");
    expect(published.size).toBe(0); // nothing committed

    state.failFrom = Infinity; // Redis is back
    await relay.runOnce();
    expect([...published]).toEqual(["1", "2", "3"]);
    // Row 1 was enqueued twice under the SAME job id, which BullMQ ignores (dedupe).
    expect(adds.filter((a) => a.jobId === "1")).toHaveLength(2);
  });

  it("gives up on a queue that never answers, within the enqueue timeout", async () => {
    const { store, published } = fakeStore([row("1")]);
    const { queue } = fakeQueue({ hang: true });

    const error = await relayWith({ store, queue, enqueueTimeoutMs: 40 })
      .runOnce()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(published.size).toBe(0);
  });

  it("reports published/quarantined counts and the age of the oldest unpublished row", async () => {
    const { store } = fakeStore([row("1"), row("2", { payload: {} })]);
    const { queue } = fakeQueue();
    const metrics = recordingMetrics();

    await relayWith({ store, queue, metrics }).runOnce();

    expect(metrics.increment).toHaveBeenCalledWith(
      "outbox_relay_published_total",
      {},
      1
    );
    expect(metrics.increment).toHaveBeenCalledWith(
      "outbox_relay_quarantined_total",
      {},
      1
    );
    expect(metrics.gauge).toHaveBeenCalledWith(
      "outbox_oldest_unpublished_age_seconds",
      expect.any(Number)
    );
  });
});

describe("relay loop", () => {
  const sleeps: number[] = [];
  const fakeSleep = async (ms: number) => {
    sleeps.push(ms);
    await new Promise((resolve) => setImmediate(resolve));
  };

  it("keeps polling, records its last successful poll, and stops after finishing the current batch", async () => {
    sleeps.length = 0;
    const { store } = fakeStore([row("1")]);
    const { queue } = fakeQueue();
    const relay = relayWith({
      store,
      queue,
      sleep: fakeSleep,
      now: () => new Date("2026-09-21T00:00:00Z"),
    });

    expect(relay.health().lastPollAt).toBeNull();
    relay.start();
    await vi.waitFor(() => expect(sleeps.length).toBeGreaterThanOrEqual(2));
    await relay.stop();

    expect(relay.health()).toEqual({
      lastPollAt: new Date("2026-09-21T00:00:00Z"),
      consecutiveFailures: 0,
    });
    expect(sleeps.every((ms) => ms === 100)).toBe(true);
  });

  it("backs off exponentially, capped, while the store keeps failing, and reports the failures", async () => {
    sleeps.length = 0;
    const store: OutboxStore = {
      ...fakeStore([]).store,
      publishBatch: async () => {
        throw new Error("database down");
      },
    };
    const { queue } = fakeQueue();
    const logger = silentLogger();
    const relay = relayWith({ store, queue, sleep: fakeSleep, logger });

    relay.start();
    await vi.waitFor(() => expect(sleeps.length).toBeGreaterThanOrEqual(4));
    await relay.stop();

    expect(sleeps.slice(0, 4)).toEqual([200, 400, 800, 1000]);
    expect(relay.health().consecutiveFailures).toBeGreaterThanOrEqual(4);
    expect(relay.health().lastPollAt).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      "outbox.relay.poll_failed",
      expect.anything()
    );
  });

  it("polls again immediately when the batch was full", async () => {
    sleeps.length = 0;
    const many = Array.from({ length: 25 }, (_, i) => row(String(i + 1)));
    const { store, published } = fakeStore(many);
    const { queue } = fakeQueue();
    const relay = relayWith({ store, queue, sleep: fakeSleep, batchSize: 10 });

    relay.start();
    await vi.waitFor(() => expect(published.size).toBe(25));
    await relay.stop();

    // Two full batches did not sleep; only the short third batch did.
    expect(sleeps).toContain(100);
  });
});
