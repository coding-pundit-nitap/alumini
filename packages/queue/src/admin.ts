import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { QueueName } from "@nitap/jobs";

/**
 * A failed job as an operator sees it. The payload is deliberately absent: it
 * can hold an address and a token.
 */
export type FailedJobSummary = {
  queue: QueueName;
  id: string;
  name: string;
  attemptsMade: number;
  failedReason: string;
  finishedOn: number | null;
};

/** Jobs per BullMQ state, sampled for `queue_jobs` at scrape time. */
export type JobCounts = Record<
  "waiting" | "active" | "delayed" | "failed" | "completed",
  number
>;

export interface QueueAdmin {
  listFailed(queue: QueueName, limit: number): Promise<FailedJobSummary[]>;
  /**
   * Re-queues these failed jobs; returns how many were failed and are now
   * retried.
   */
  retry(queue: QueueName, ids: readonly string[]): Promise<number>;
  retryAll(queue: QueueName): Promise<number>;
  jobCounts(queue: QueueName): Promise<JobCounts>;
  close(): Promise<void>;
}

export function createQueueAdmin(options: {
  url: string;
  prefix?: string;
}): QueueAdmin {
  const connection = new Redis(options.url, { maxRetriesPerRequest: null });
  connection.on("error", () => {});
  const queues = new Map<QueueName, Queue>();
  const queueFor = (name: QueueName) => {
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection, prefix: options.prefix });
      queue.on("error", () => {});
      queues.set(name, queue);
    }
    return queue;
  };

  return {
    async listFailed(name, limit) {
      const jobs = await queueFor(name).getFailed(0, Math.max(0, limit - 1));
      return jobs.map((job) => ({
        queue: name,
        id: String(job.id ?? ""),
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason ?? "",
        finishedOn: job.finishedOn ?? null,
      }));
    },

    async retry(name, ids) {
      const queue = queueFor(name);
      let retried = 0;
      for (const id of ids) {
        const job = await queue.getJob(id);
        if (job && (await job.isFailed())) {
          await job.retry("failed");
          retried += 1;
        }
      }
      return retried;
    },

    async retryAll(name) {
      const queue = queueFor(name);
      let retried = 0;
      // A retried job leaves the failed set, so this terminates; the page cap is only a safety net.
      for (let page = 0; page < 1_000; page++) {
        const jobs = await queue.getFailed(0, 99);
        if (jobs.length === 0) break;
        for (const job of jobs) {
          await job.retry("failed");
          retried += 1;
        }
      }
      return retried;
    },

    async jobCounts(name) {
      const counts = await queueFor(name).getJobCounts(
        "waiting",
        "active",
        "delayed",
        "failed",
        "completed"
      );
      return {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      };
    },

    async close() {
      await Promise.all(
        [...queues.values()].map((queue) => queue.close().catch(() => {}))
      );
      connection.disconnect();
    },
  };
}
