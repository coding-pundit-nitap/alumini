import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { PermanentJobError, defineJob } from "@nitap/jobs";
import { createRedisNamespace } from "@nitap/testing";

import { recordingMetrics, silentLogger } from "../tests/support.ts";
import { createQueueAdmin } from "./admin.ts";
import { createBullQueuePort } from "./bull-queue.ts";
import { createWorkerRuntime, registerJob } from "./runtime.ts";
import type { JobProcessor } from "./runtime.ts";

const testJob = defineJob({
  name: "test.run",
  version: 1,
  queue: "default",
  schema: z.object({ v: z.literal(1), n: z.number() }).strict(),
  retry: { attempts: 3, baseDelayMs: 20, maxDelayMs: 40, jitter: 0 },
  timeoutMs: 5_000,
  idempotency: "test job: running it twice only records twice, harmless here",
});
type Payload = { v: 1; n: number };
const payload: Payload = { v: 1, n: 1 };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const eventually = (assertion: () => unknown | Promise<unknown>) =>
  vi.waitFor(assertion, { timeout: 8_000, interval: 25 });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function harness(process: JobProcessor<Payload>) {
  const ns = await createRedisNamespace();
  const port = createBullQueuePort({
    url: ns.url,
    prefix: ns.prefix,
    addTimeoutMs: 1_000,
  });
  const admin = createQueueAdmin({ url: ns.url, prefix: ns.prefix });
  const logger = silentLogger();
  const metrics = recordingMetrics();
  const runtime = createWorkerRuntime({
    redisUrl: ns.url,
    prefix: ns.prefix,
    jobs: [registerJob(testJob, process)],
    logger,
    metrics,
    unknownVersionDelayMs: 200,
  });
  await runtime.start();
  cleanups.push(async () => {
    await runtime.close({ timeoutMs: 1_000 });
    await port.close();
    await admin.close();
    await ns.cleanup();
  });
  return { ns, port, admin, runtime, logger, metrics };
}

describe("queue + worker runtime (real Redis)", () => {
  it("dedupes a job added twice under the same id: it runs once", async () => {
    const process = vi.fn(async () => {});
    const { port } = await harness(process);

    await port.add(testJob, payload, { jobId: "dup-1" });
    await port.add(testJob, payload, { jobId: "dup-1" });
    await eventually(() => expect(process).toHaveBeenCalledTimes(1));
    await wait(300);

    expect(process).toHaveBeenCalledTimes(1);
  });

  it("retries a failing job with backoff until it succeeds, counting attempts", async () => {
    const attempts: number[] = [];
    const { port } = await harness(async (_p, context) => {
      attempts.push(context.attempt);
      if (context.attempt < 3) throw new Error("provider unavailable");
    });

    await port.add(testJob, payload, { jobId: "retry-1" });

    await eventually(() => expect(attempts).toEqual([1, 2, 3]));
  });

  it("sends a permanent failure straight to the failed set after ONE attempt", async () => {
    const process = vi.fn(async () => {
      throw new PermanentJobError("mailbox does not exist");
    });
    const { port, admin, metrics } = await harness(process);

    await port.add(testJob, payload, { jobId: "perm-1" });

    await eventually(async () =>
      expect(await admin.listFailed("default", 10)).toHaveLength(1)
    );
    expect(process).toHaveBeenCalledTimes(1);
    const [failed] = await admin.listFailed("default", 10);
    expect(failed).toMatchObject({
      queue: "default",
      id: "perm-1",
      name: "test.run",
    });
    expect(failed?.failedReason).toContain("mailbox");
    expect(metrics.increment).toHaveBeenCalledWith("jobs_dead_total", {
      queue: "default",
      job: "test.run",
    });
  });

  it("gives up after the last attempt: failed set, one dead-letter signal", async () => {
    const process = vi.fn(async () => {
      throw new Error("still unavailable");
    });
    const { port, admin, metrics, logger } = await harness(process);

    await port.add(testJob, payload, { jobId: "exhaust-1" });

    await eventually(async () =>
      expect(await admin.listFailed("default", 10)).toHaveLength(1)
    );
    expect(process).toHaveBeenCalledTimes(3);
    expect(
      metrics.increment.mock.calls.filter(
        ([name]) => name === "jobs_dead_total"
      )
    ).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith("job.dead", expect.anything());
  });

  it("holds back a payload of a newer version without failing it", async () => {
    const process = vi.fn(async () => {});
    const { port, admin } = await harness(process);

    await port.add(testJob, { v: 2, n: 1 } as never, { jobId: "future-1" });
    await wait(600);

    expect(process).not.toHaveBeenCalled();
    expect(await admin.listFailed("default", 10)).toEqual([]);
  });

  it("retries a failed job on demand through the admin", async () => {
    let calls = 0;
    const { port, admin } = await harness(async () => {
      calls += 1;
      if (calls === 1) throw new PermanentJobError("first run fails");
    });

    await port.add(testJob, payload, { jobId: "admin-1" });
    await eventually(async () =>
      expect(await admin.listFailed("default", 10)).toHaveLength(1)
    );

    expect(await admin.retry("default", ["admin-1"])).toBe(1);
    await eventually(() => expect(calls).toBe(2));
    await eventually(async () =>
      expect(await admin.listFailed("default", 10)).toHaveLength(0)
    );
  });

  it("registers a schedule once however many times it is upserted", async () => {
    const { port, ns } = await harness(async () => {});
    const schedule = { id: "tick", everyMs: 60_000, payload: { v: 1, n: 0 } };

    await port.upsertSchedule(testJob, schedule);
    await port.upsertSchedule(testJob, schedule);

    const connection = new Redis(ns.url, { maxRetriesPerRequest: null });
    const queue = new Queue("default", { connection, prefix: ns.prefix });
    try {
      expect(await queue.getJobSchedulers()).toHaveLength(1);
    } finally {
      await queue.close();
      connection.disconnect();
    }
  });

  it("finishes in-flight work before a graceful close returns", async () => {
    let started = false;
    let finished = false;
    const { port, runtime } = await harness(async () => {
      started = true;
      await wait(300);
      finished = true;
    });
    await port.add(testJob, payload, { jobId: "drain-1" });
    await eventually(() => expect(started).toBe(true));

    await runtime.close({ timeoutMs: 5_000 });

    expect(finished).toBe(true);
    expect(runtime.health()).toEqual({ running: false, draining: true });
  });

  it("force-closes when in-flight work does not finish within the timeout", async () => {
    let started = false;
    const { port, runtime } = await harness(async () => {
      started = true;
      await new Promise(() => {}); // ignores the abort signal on purpose
    });
    await port.add(testJob, payload, { jobId: "stuck-1" });
    await eventually(() => expect(started).toBe(true));

    const began = Date.now();
    await runtime.close({ timeoutMs: 200 });

    expect(Date.now() - began).toBeLessThan(4_000);
  });

  it("fails fast, instead of hanging, when the queue Redis is unreachable", async () => {
    const port = createBullQueuePort({
      url: "redis://127.0.0.1:1",
      addTimeoutMs: 400,
    });
    const began = Date.now();

    await expect(
      port.add(testJob, payload, { jobId: "down-1" })
    ).rejects.toThrow(/timed out/);

    expect(Date.now() - began).toBeLessThan(3_000);
    await port.close();
  });
});
