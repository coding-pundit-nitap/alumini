import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { JobDefinition, QueueName } from "@nitap/jobs";

import type { QueuePort } from "./port.ts";
import { withTimeout } from "./timeout.ts";

export type BullQueuePortOptions = {
  /** The QUEUE Redis (noeviction + AOF), never the cache Redis. */
  url: string;
  /** BullMQ key prefix; tests use a unique one per test. */
  prefix?: string;
  /**
   * Upper bound on one `add`, so an unreachable Redis fails fast instead of
   * hanging the relay.
   */
  addTimeoutMs?: number;
  /**
   * Called for connection errors (ioredis would otherwise throw on an unhandled
   * 'error' event).
   */
  onError?: (error: Error) => void;
};

const COMPLETED_KEEP_SECONDS = 60 * 60; // dedupe window for a re-published event
const FAILED_KEEP_SECONDS = 7 * 24 * 60 * 60; // the "DLQ": failed jobs stay visible to the operator

export function createBullQueuePort(options: BullQueuePortOptions): QueuePort {
  const { url, prefix, addTimeoutMs = 5_000, onError = () => {} } = options;
  // Fail fast: no offline queue, one retry per command. The worker uses a different connection.
  const connection = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 2_000),
  });
  connection.on("error", onError);

  const queues = new Map<QueueName, Queue>();
  const queueFor = (name: QueueName) => {
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection, prefix });
      queue.on("error", onError);
      queues.set(name, queue);
    }
    return queue;
  };

  const jobOptions = (job: JobDefinition) => ({
    attempts: job.retry.attempts,
    // The delay comes from the worker's backoffStrategy (computeBackoffMs), so the policy lives in one place.
    backoff: { type: "custom" },
    removeOnComplete: { age: COMPLETED_KEEP_SECONDS },
    removeOnFail: { age: FAILED_KEEP_SECONDS },
  });

  return {
    async add(job, payload, { jobId, requestId }) {
      const queue = queueFor(job.queue);
      await withTimeout(
        (async () => {
          await queue.waitUntilReady();
          await queue.add(
            job.name,
            { eventId: jobId, requestId: requestId ?? null, payload },
            { ...jobOptions(job), jobId }
          );
        })(),
        addTimeoutMs,
        "queue.add"
      );
    },

    async upsertSchedule(job, schedule) {
      await queueFor(job.queue).upsertJobScheduler(
        schedule.id,
        { every: schedule.everyMs },
        {
          name: job.name,
          data: {
            eventId: schedule.id,
            requestId: null,
            payload: schedule.payload,
          },
          opts: jobOptions(job),
        }
      );
    },

    async close() {
      await Promise.all(
        [...queues.values()].map((queue) =>
          withTimeout(queue.close(), 2_000, "queue.close").catch(() => {})
        )
      );
      connection.disconnect();
    },
  };
}
