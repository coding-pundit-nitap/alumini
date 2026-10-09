import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRedisNamespace, type RedisNamespace } from "@nitap/testing";

import { crashJob, FAST_STALL } from "../tests/crash-job.ts";
import { recordingMetrics, silentLogger } from "../tests/support.ts";
import { createQueueAdmin } from "./admin.ts";
import { createBullQueuePort } from "./bull-queue.ts";
import {
  createWorkerRuntime,
  registerJob,
  type JobContext,
  type WorkerRuntime,
} from "./runtime.ts";

// Worker crash mid-job and shutdown during a long job. A worker that
// dies stops renewing its job's lock; the next worker's stalled check returns the job to the queue and runs
// it. Real Redis, a real child process and a real SIGKILL: nothing is simulated.
const eventually = (assertion: () => unknown | Promise<unknown>) =>
  vi.waitFor(assertion, { timeout: 15_000, interval: 50 });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function namespace() {
  const ns = await createRedisNamespace();
  const port = createBullQueuePort({
    url: ns.url,
    prefix: ns.prefix,
    addTimeoutMs: 1_000,
  });
  const admin = createQueueAdmin({ url: ns.url, prefix: ns.prefix });
  cleanups.push(async () => {
    await port.close();
    await admin.close();
    await ns.cleanup();
  });
  return { ns, port, admin };
}

function runtimeFor(
  ns: RedisNamespace,
  process: (context: JobContext) => Promise<void>
): WorkerRuntime {
  const runtime = createWorkerRuntime({
    redisUrl: ns.url,
    prefix: ns.prefix,
    logger: silentLogger(),
    metrics: recordingMetrics(),
    ...FAST_STALL,
    jobs: [registerJob(crashJob, (_payload, context) => process(context))],
  });
  cleanups.push(() => runtime.close({ timeoutMs: 500 }));
  return runtime;
}

/** Starts the child worker process and resolves once it reports that it holds `jobId`. */
function childWorker(ns: RedisNamespace) {
  const child: ChildProcess = spawn(
    process.execPath,
    [
      path.resolve(import.meta.dirname, "../tests/crash-worker.ts"),
      ns.url,
      ns.prefix,
    ],
    { stdio: ["ignore", "pipe", "inherit"] }
  );
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  let output = "";
  child.stdout!.on("data", (chunk: Buffer) => (output += chunk.toString()));
  return {
    child,
    started: (jobId: string) =>
      eventually(() => expect(output).toContain(`STARTED ${jobId}`)),
    ready: () => eventually(() => expect(output).toContain("READY")),
  };
}

describe("worker crash and shutdown recovery (real Redis, real processes)", () => {
  it("a worker killed with SIGKILL mid-job loses nothing: the job is recovered as stalled and completes once on another worker", async () => {
    const { ns, port, admin } = await namespace();
    const worker = childWorker(ns);
    await worker.ready();

    await port.add(crashJob, { v: 1, n: 1 }, { jobId: "crash-1" });
    await worker.started("crash-1");

    worker.child.kill("SIGKILL");
    await new Promise((resolve) => worker.child.once("exit", resolve));

    const runs: JobContext[] = [];
    await runtimeFor(ns, async (context) => {
      runs.push(context);
    }).start();

    await eventually(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.jobId).toBe("crash-1");
    await eventually(async () =>
      expect(await admin.jobCounts("default")).toMatchObject({
        completed: 1,
        failed: 0,
        active: 0,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(runs).toHaveLength(1);
  }, 30_000);

  it("a job still running when shutdown's grace period ends is redelivered as stalled to the next worker", async () => {
    const { ns, port } = await namespace();
    let started = false;
    const first = runtimeFor(ns, async () => {
      started = true;
      await new Promise(() => {}); // a fan-out longer than the grace period
    });
    await first.start();
    await port.add(crashJob, { v: 1, n: 2 }, { jobId: "long-1" });
    await eventually(() => expect(started).toBe(true));

    // Graceful close gives up after its timeout and drops the connection (production: 30 s).
    await first.close({ timeoutMs: 200 });

    const runs: string[] = [];
    await runtimeFor(ns, async ({ jobId }) => {
      runs.push(jobId);
    }).start();
    await eventually(() => expect(runs).toEqual(["long-1"]));
  }, 30_000);
});
