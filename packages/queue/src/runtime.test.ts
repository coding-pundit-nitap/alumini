import { DelayedError, UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DeferJobError, PermanentJobError, defineJob } from "@nitap/jobs";
import { getRequestContext } from "@nitap/observability";

import { recordingMetrics, silentLogger } from "../tests/support.ts";
import { executeJob, registerJob } from "./runtime.ts";
import type { JobContext, RunnableJob } from "./runtime.ts";
import { TimeoutError } from "./timeout.ts";

const definition = defineJob({
  name: "test.run",
  version: 1,
  queue: "default",
  schema: z.object({ v: z.literal(1), who: z.string() }).strict(),
  retry: { attempts: 3, baseDelayMs: 10, maxDelayMs: 50, jitter: 0 },
  timeoutMs: 200,
  idempotency: "test job: running it twice only records twice, harmless here",
});

type Payload = { v: 1; who: string };
const NOW = 1_000_000;

function setup(
  process: (payload: Payload, context: JobContext) => Promise<void>
) {
  const logger = silentLogger();
  const metrics = recordingMetrics();
  const registry = new Map([["test.run", registerJob(definition, process)]]);
  const deps = {
    registry,
    logger,
    metrics,
    unknownVersionDelayMs: 5_000,
    now: () => NOW,
  };
  const job = (
    over: Partial<RunnableJob> & { payload?: unknown } = {}
  ): RunnableJob & { moveToDelayed: ReturnType<typeof vi.fn> } =>
    ({
      id: "job-1",
      name: "test.run",
      attemptsMade: 0,
      data: {
        eventId: "job-1",
        requestId: "req-9",
        payload: over.payload ?? { v: 1, who: "ada@example.test" },
      },
      moveToDelayed: vi.fn(async () => {}),
      ...over,
    }) as never;
  return { deps, logger, metrics, job };
}

describe("executeJob", () => {
  it("runs the processor with the validated payload, the attempt number and the request id in context", async () => {
    const seen: unknown[] = [];
    const { deps, job, metrics } = setup(async (payload, context) => {
      seen.push(
        payload,
        context.jobId,
        context.attempt,
        context.requestId,
        getRequestContext()?.requestId
      );
    });

    await executeJob(deps, job());

    expect(seen).toEqual([
      { v: 1, who: "ada@example.test" },
      "job-1",
      1,
      "req-9",
      "req-9",
    ]);
    expect(metrics.increment).toHaveBeenCalledWith("jobs_processed_total", {
      queue: "default",
      job: "test.run",
      outcome: "completed",
    });
  });

  it("fails permanently on an unknown job name", async () => {
    const { deps, job } = setup(async () => {});
    await expect(
      executeJob(deps, job({ name: "nope.run" }))
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("fails permanently on an invalid payload of the current version, without running the processor", async () => {
    const process = vi.fn(async () => {});
    const { deps, job, logger, metrics } = setup(process);

    await expect(
      executeJob(deps, job({ payload: { v: 1, who: 42 } }))
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(process).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("job.dead", expect.anything());
    expect(metrics.increment).toHaveBeenCalledWith("jobs_dead_total", {
      queue: "default",
      job: "test.run",
    });
  });

  it("defers, without using an attempt, a payload of a newer version than this worker knows", async () => {
    const process = vi.fn(async () => {});
    const { deps, job } = setup(process);
    const j = job({ payload: { v: 2, who: "x" } });

    await expect(executeJob(deps, j, "tok")).rejects.toBeInstanceOf(
      DelayedError
    );

    expect(j.moveToDelayed).toHaveBeenCalledWith(NOW + 5_000, "tok");
    expect(process).not.toHaveBeenCalled();
  });

  it("turns a PermanentJobError into an unrecoverable failure and reports the job dead", async () => {
    const { deps, job, logger, metrics } = setup(async () => {
      throw new PermanentJobError("mailbox does not exist");
    });

    await expect(executeJob(deps, job())).rejects.toBeInstanceOf(
      UnrecoverableError
    );

    expect(logger.error).toHaveBeenCalledWith("job.dead", expect.anything());
    expect(metrics.increment).toHaveBeenCalledWith("jobs_dead_total", {
      queue: "default",
      job: "test.run",
    });
  });

  it("rethrows an ordinary failure for retry, and only logs a retry while attempts remain", async () => {
    const boom = new Error("provider unavailable");
    const { deps, job, logger, metrics } = setup(async () => {
      throw boom;
    });

    await expect(executeJob(deps, job({ attemptsMade: 0 }))).rejects.toBe(boom);

    expect(logger.warn).toHaveBeenCalledWith("job.retry", expect.anything());
    expect(logger.error).not.toHaveBeenCalledWith(
      "job.dead",
      expect.anything()
    );
    expect(metrics.increment).not.toHaveBeenCalledWith(
      "jobs_dead_total",
      expect.anything()
    );
  });

  it("reports the job dead when the LAST attempt fails", async () => {
    const boom = new Error("still unavailable");
    const { deps, job, logger, metrics } = setup(async () => {
      throw boom;
    });

    await expect(executeJob(deps, job({ attemptsMade: 2 }))).rejects.toBe(boom); // 3rd of 3

    expect(logger.error).toHaveBeenCalledWith("job.dead", expect.anything());
    expect(metrics.increment).toHaveBeenCalledWith("jobs_dead_total", {
      queue: "default",
      job: "test.run",
    });
  });

  it("reschedules on DeferJobError without failing or consuming an attempt", async () => {
    const { deps, job } = setup(async () => {
      throw new DeferJobError(30_000);
    });
    const j = job();

    await expect(executeJob(deps, j, "tok")).rejects.toBeInstanceOf(
      DelayedError
    );

    expect(j.moveToDelayed).toHaveBeenCalledWith(NOW + 30_000, "tok");
  });

  it("aborts the signal and fails with a TimeoutError when the processor exceeds the job timeout", async () => {
    let signal: AbortSignal | undefined;
    const { deps, job } = setup(async (_payload, context) => {
      signal = context.signal;
      await new Promise(() => {}); // never finishes
    });

    const error = await executeJob(deps, job()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it("never writes the payload into a log line", async () => {
    const { deps, job, logger } = setup(async () => {
      throw new Error("provider unavailable");
    });
    await executeJob(deps, job()).catch(() => {});
    const logged = JSON.stringify(
      [logger.warn, logger.error, logger.info].flatMap((fn) => fn.mock.calls)
    );
    expect(logged).not.toContain("ada@example.test");
  });
});
