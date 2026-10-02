import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { defineJob } from "@nitap/jobs";

import { recordingMetrics, silentLogger } from "../tests/support.ts";
import { createWorkerRuntime, registerJob } from "./runtime.ts";

// close() against fake BullMQ and ioredis, so a BullMQ close that never returns (seen after a queue Redis
// reconnect, bullmq 6.3.8 to 6.3.11) can be produced on demand and time can be stepped exactly.
const fakes = vi.hoisted(() => {
  type Processor = (job: unknown, token?: string) => Promise<void>;
  const state = {
    workers: [] as Array<{ processor: Processor }>,
    connections: [] as Array<{
      quit: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }>,
    /** What every Worker.close() returns; a never-settling promise reproduces the BullMQ bug. */
    closeResult: () => Promise.resolve() as Promise<void>,
  };
  class Worker {
    processor: Processor;
    constructor(_name: string, processor: Processor) {
      this.processor = processor;
      state.workers.push(this);
    }
    on() {
      return this;
    }
    waitUntilReady() {
      return Promise.resolve();
    }
    close() {
      return state.closeResult();
    }
  }
  class Redis {
    quit = vi.fn(async () => "OK");
    disconnect = vi.fn();
    constructor() {
      state.connections.push(this);
    }
    on() {
      return this;
    }
  }
  return { state, Worker, Redis };
});

vi.mock("bullmq", () => ({
  Worker: fakes.Worker,
  DelayedError: class extends Error {},
  UnrecoverableError: class extends Error {},
}));
vi.mock("ioredis", () => ({ Redis: fakes.Redis }));

const definition = defineJob({
  name: "test.run",
  version: 1,
  queue: "default",
  schema: z.object({ v: z.literal(1) }).strict(),
  retry: { attempts: 1, baseDelayMs: 10, maxDelayMs: 10, jitter: 0 },
  timeoutMs: 600_000,
  idempotency: "test job: never retried here",
});

const job = {
  id: "job-1",
  name: "test.run",
  attemptsMade: 0,
  data: { eventId: "job-1", requestId: null, payload: { v: 1 } },
};

async function startRuntime(process: () => Promise<void>) {
  const logger = silentLogger();
  const runtime = createWorkerRuntime({
    redisUrl: "redis://localhost:6380",
    jobs: [registerJob(definition, process)],
    logger,
    metrics: recordingMetrics(),
  });
  await runtime.start();
  const [connection] = fakes.state.connections;
  const runJob = () => fakes.state.workers[0]!.processor(job, "token");
  return { runtime, logger, connection: connection!, runJob };
}

/** Resolves to how long (fake) `promise` took, stepping the clock in 100 ms ticks up to `limitMs`. */
async function elapsed(promise: Promise<unknown>, limitMs: number) {
  let done = false;
  void promise.then(() => (done = true));
  let ms = 0;
  while (!done && ms < limitMs) {
    await vi.advanceTimersByTimeAsync(100);
    ms += 100;
  }
  return done ? ms : Infinity;
}

const forceReason = (logger: ReturnType<typeof silentLogger>) =>
  logger.warn.mock.calls.find(
    ([event]) => event === "queue.worker.force_close"
  )?.[1]?.metadata?.reason;

describe("WorkerRuntime.close", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakes.state.workers = [];
    fakes.state.connections = [];
    fakes.state.closeResult = () => Promise.resolve();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("quits the connection without forcing when BullMQ closes", async () => {
    const { runtime, logger, connection } = await startRuntime(async () => {});

    expect(await elapsed(runtime.close({ timeoutMs: 30_000 }), 1_000)).toBe(
      100
    );
    expect(connection.quit).toHaveBeenCalled();
    expect(connection.disconnect).not.toHaveBeenCalled();
    expect(forceReason(logger)).toBeUndefined();
  });

  it("forces after the 2 s grace, not the 30 s timeout, when BullMQ's close never returns and no job runs", async () => {
    fakes.state.closeResult = () => new Promise(() => {});
    const { runtime, logger, connection } = await startRuntime(async () => {});

    const ms = await elapsed(runtime.close({ timeoutMs: 30_000 }), 31_000);

    expect(ms).toBeGreaterThanOrEqual(2_000);
    expect(ms).toBeLessThan(3_000);
    expect(connection.disconnect).toHaveBeenCalled();
    expect(connection.quit).not.toHaveBeenCalled();
    expect(forceReason(logger)).toBe("close_stuck");
  });

  it("still lets a running job finish within the timeout, then gives BullMQ the grace", async () => {
    fakes.state.closeResult = () => new Promise(() => {});
    let finished = false;
    const { runtime, logger, runJob } = await startRuntime(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      finished = true;
    });
    void runJob();

    const ms = await elapsed(runtime.close({ timeoutMs: 30_000 }), 31_000);

    expect(finished).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(7_000); // the job's 5 s, then the 2 s grace
    expect(ms).toBeLessThan(8_000);
    expect(forceReason(logger)).toBe("close_stuck");
  });

  it("forces at the timeout when a job is still running", async () => {
    fakes.state.closeResult = () => new Promise(() => {});
    const { runtime, logger, connection, runJob } = await startRuntime(
      () => new Promise(() => {})
    );
    void runJob();

    const ms = await elapsed(runtime.close({ timeoutMs: 10_000 }), 31_000);

    expect(ms).toBe(10_000);
    expect(connection.disconnect).toHaveBeenCalled();
    expect(forceReason(logger)).toBe("jobs_running");
  });
});
