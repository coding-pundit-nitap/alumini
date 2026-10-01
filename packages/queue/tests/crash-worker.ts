// A worker process that takes one job and never finishes it, so the test can kill it mid-job with SIGKILL.
// Prints `STARTED <jobId>` once the job is running. Run: node tests/crash-worker.ts <redisUrl> <prefix>
import type { Logger, Metrics } from "@nitap/observability";

import { createWorkerRuntime, registerJob } from "../src/runtime.ts";
import { crashJob, FAST_STALL } from "./crash-job.ts";

const [redisUrl, prefix] = process.argv.slice(2);
const noop = () => {};
const logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
} as Logger;
const metrics = {
  increment: noop,
  observe: noop,
  gauge: noop,
} as unknown as Metrics;

const runtime = createWorkerRuntime({
  redisUrl: redisUrl!,
  prefix,
  logger,
  metrics,
  ...FAST_STALL,
  jobs: [
    registerJob(crashJob, async (_payload, { jobId }) => {
      process.stdout.write(`STARTED ${jobId}\n`);
      await new Promise(() => {});
    }),
  ],
});
await runtime.start();
process.stdout.write("READY\n");
