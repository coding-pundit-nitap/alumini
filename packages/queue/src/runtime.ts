import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";
import { Redis } from "ioredis";

import {
  DeferJobError,
  PermanentJobError,
  QUEUES,
  computeBackoffMs,
} from "@nitap/jobs";
import type { JobDefinition, QueueName } from "@nitap/jobs";
import { captureError, runWithRequestContext } from "@nitap/observability";
import type { CaptureContext, Logger, Metrics } from "@nitap/observability";

import { TimeoutError } from "./timeout.ts";

/** What a processor gets besides its validated payload. */
export type JobContext = {
  jobId: string;
  /** 1-based attempt number. */
  attempt: number;
  /** Correlation id of the request that wrote the event, or null for scheduled jobs. */
  requestId: string | null;
  /** Aborted when the job timeout elapses; a cooperative processor should stop. */
  signal: AbortSignal;
  logger: Logger;
};

export type JobProcessor<TPayload> = (
  payload: TPayload,
  context: JobContext
) => Promise<void>;

export type RegisteredJob<TPayload = unknown> = {
  definition: JobDefinition<string, TPayload>;
  process: JobProcessor<TPayload>;
};

/** Pairs a definition with its processor so the payload type flows from one to the other. */
export function registerJob<TPayload>(
  definition: JobDefinition<string, TPayload>,
  process: JobProcessor<TPayload>
): RegisteredJob {
  return { definition, process } as unknown as RegisteredJob;
}

export type RunnableJob = Pick<
  Job,
  "id" | "name" | "data" | "attemptsMade" | "moveToDelayed"
>;

type Envelope = {
  eventId?: string;
  requestId?: string | null;
  payload?: unknown;
};

export type ExecuteDeps = {
  registry: ReadonlyMap<string, RegisteredJob>;
  logger: Logger;
  metrics: Metrics;
  /** Reports a dead job to the error tracker; defaults to `@nitap/observability`'s. */
  captureError?: (error: unknown, context: CaptureContext) => void;
  /** How long to hold back a payload of a newer version than this worker knows. */
  unknownVersionDelayMs: number;
  now?: () => number;
};

/**
 * Runs one job independently of BullMQ's Worker so it is unit-testable: validates, restores context,
 * enforces the timeout and maps errors to retry/fail/delay. Error messages are logged, so keep personal
 * data out of them.
 */
export async function executeJob(
  deps: ExecuteDeps,
  job: RunnableJob,
  token?: string
): Promise<void> {
  const now = deps.now ?? Date.now;
  const { logger, metrics } = deps;

  const registered = deps.registry.get(job.name);
  if (!registered) {
    throw new UnrecoverableError(
      `No processor registered for job "${job.name}"`
    );
  }
  const { definition, process } = registered;
  const labels = { queue: definition.queue, job: definition.name };
  const envelope = (job.data ?? {}) as Envelope;
  const requestId = envelope.requestId ?? null;
  const jobId = String(job.id ?? "unknown");
  const attempt = job.attemptsMade + 1;
  const isLastAttempt = attempt >= definition.retry.attempts;

  const dead = (reason: string, error?: unknown) => {
    logger.error("job.dead", {
      metadata: { job: definition.name, jobId, attempts: attempt, reason },
    });
    (deps.captureError ?? captureError)(error ?? new Error(reason), {
      tags: { ...labels, job_id: jobId, request_id: requestId ?? undefined },
      extra: { attempts: attempt },
    });
    metrics.increment("jobs_dead_total", labels);
    metrics.increment("jobs_processed_total", { ...labels, outcome: "failed" });
  };
  const defer = async (delayMs: number, reason: string): Promise<never> => {
    logger.warn("job.deferred", {
      metadata: { job: definition.name, jobId, reason },
    });
    await job.moveToDelayed(now() + delayMs, token);
    throw new DelayedError();
  };

  const parsed = definition.schema.safeParse(envelope.payload);
  if (!parsed.success) {
    const version = (envelope.payload as { v?: unknown } | null | undefined)?.v;
    if (typeof version === "number" && version > definition.version) {
      return defer(
        deps.unknownVersionDelayMs,
        "payload version is newer than this worker"
      );
    }
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    dead(`invalid payload: ${problems}`);
    throw new UnrecoverableError(
      `Invalid payload for ${definition.name}: ${problems}`
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), definition.timeoutMs);
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () =>
        reject(
          new TimeoutError(
            `${definition.name} exceeded ${definition.timeoutMs} ms`
          )
        ),
      { once: true }
    );
  });
  const started = performance.now();

  try {
    await runWithRequestContext(
      { requestId: requestId ?? `job-${jobId}` },
      () =>
        Promise.race([
          process(parsed.data, {
            jobId,
            attempt,
            requestId,
            signal: controller.signal,
            logger,
          }),
          timedOut,
        ])
    );
    metrics.increment("jobs_processed_total", {
      ...labels,
      outcome: "completed",
    });
  } catch (error) {
    if (error instanceof DeferJobError) {
      return defer(error.delayMs, error.message);
    }
    if (error instanceof PermanentJobError) {
      dead(error.message, error);
      throw new UnrecoverableError(error.message);
    }
    if (isLastAttempt) {
      dead(error instanceof Error ? error.message : "unknown error", error);
    } else {
      logger.warn("job.retry", {
        error,
        metadata: { job: definition.name, jobId, attempt },
      });
      metrics.increment("jobs_processed_total", {
        ...labels,
        outcome: "retry",
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    metrics.observe(
      "job_duration_seconds",
      (performance.now() - started) / 1000,
      labels
    );
  }
}

export type QueueOverride = {
  concurrency?: number;
  /** BullMQ limiter: at most `max` jobs per `durationMs`, across all workers of this queue. */
  rateLimit?: { max: number; durationMs: number };
};

export type WorkerRuntimeOptions = {
  redisUrl: string;
  prefix?: string;
  jobs: readonly RegisteredJob[];
  logger: Logger;
  metrics: Metrics;
  queueOverrides?: Partial<Record<QueueName, QueueOverride>>;
  /** Default 60 s. */
  unknownVersionDelayMs?: number;
  /** A dead worker's job returns to the queue within about these two. Tests shorten them. */
  lockDurationMs?: number;
  stalledIntervalMs?: number;
};

export type WorkerRuntime = {
  start(): Promise<void>;
  /** Lets in-flight jobs finish for up to `timeoutMs` (default 30 s), then forces. */
  close(options?: { timeoutMs?: number }): Promise<void>;
  health(): { running: boolean; draining: boolean };
};

/** How long close() lets BullMQ finish its own cleanup once no job of this runtime is running. */
const CLOSE_GRACE_MS = 2_000;

export function createWorkerRuntime(
  options: WorkerRuntimeOptions
): WorkerRuntime {
  const { logger, metrics } = options;
  const registry = new Map(
    options.jobs.map((job) => [job.definition.name, job])
  );
  if (registry.size !== options.jobs.length) {
    throw new Error("A job is registered more than once");
  }
  const queueNames = [
    ...new Set(options.jobs.map((job) => job.definition.queue)),
  ];

  let connection: Redis | null = null;
  let workers: Worker[] = [];
  let running = false;
  let draining = false;
  // This runtime's own count of executing jobs. close() waits on it rather than on BullMQ's close(), which
  // can stay pending with nothing running (seen after a queue Redis reconnect; bullmq 6.3.8 to 6.3.11).
  let inFlight = 0;
  let onIdle: (() => void) | null = null;
  const track = async (run: Promise<void>) => {
    inFlight++;
    try {
      return await run;
    } finally {
      if (--inFlight === 0) onIdle?.();
    }
  };
  const idle = () =>
    inFlight === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          onIdle = resolve;
        });

  const deps: ExecuteDeps = {
    registry,
    logger,
    metrics,
    unknownVersionDelayMs: options.unknownVersionDelayMs ?? 60_000,
  };

  return {
    async start() {
      if (running) return;
      connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
      connection.on("error", (error) =>
        logger.error("queue.redis.error", { error })
      );
      workers = queueNames.map((name) => {
        const override = options.queueOverrides?.[name];
        const worker = new Worker(
          name,
          (job, token) => track(executeJob(deps, job, token)),
          {
            connection: connection as Redis,
            prefix: options.prefix,
            concurrency: override?.concurrency ?? QUEUES[name].concurrency,
            // Spread only when set: BullMQ merges with Object.assign, so an explicit undefined would replace
            // its 30 s defaults and fail its own validation.
            ...(options.lockDurationMs !== undefined && {
              lockDuration: options.lockDurationMs,
            }),
            ...(options.stalledIntervalMs !== undefined && {
              stalledInterval: options.stalledIntervalMs,
            }),
            limiter: override?.rateLimit
              ? {
                  max: override.rateLimit.max,
                  duration: override.rateLimit.durationMs,
                }
              : undefined,
            settings: {
              backoffStrategy: (attemptsMade, _type, _error, failed) => {
                const definition = registry.get(failed?.name ?? "")?.definition;
                return definition
                  ? computeBackoffMs(definition.retry, attemptsMade)
                  : 60_000;
              },
            },
          }
        );
        worker.on("error", (error) =>
          logger.error("queue.worker.error", { error })
        );
        return worker;
      });
      await Promise.all(workers.map((worker) => worker.waitUntilReady()));
      running = true;
    },

    async close({ timeoutMs = 30_000 } = {}) {
      draining = true;
      // BullMQ memoizes close(), so a later close(true) can't force it; closing the shared connection is the
      // only lever. allSettled avoids an unhandled rejection from a job that never returns.
      const graceful = Promise.allSettled(
        workers.map((worker) => worker.close())
      );
      // In-flight jobs get the whole timeout. Once they are done, BullMQ gets a short grace to finish its own
      // cleanup; past that its close is stuck, not draining, and waiting longer would only delay the stop.
      const timers: ReturnType<typeof setTimeout>[] = [];
      let decided = false;
      const after = <T>(ms: number, value: T) =>
        new Promise<T>((resolve) => {
          if (!decided) timers.push(setTimeout(resolve, ms, value));
        });
      const stuck = Promise.race([
        idle().then(() => after(CLOSE_GRACE_MS, "close_stuck" as const)),
        after(timeoutMs, "jobs_running" as const),
      ]);
      const outcome = await Promise.race([
        graceful.then(() => "closed" as const),
        stuck,
      ]);
      decided = true;
      for (const timer of timers) clearTimeout(timer);
      const finished = outcome === "closed";
      if (!finished) {
        logger.warn("queue.worker.force_close", {
          metadata: { timeoutMs, reason: outcome, inFlight },
        });
      }
      workers = [];
      running = false;
      const closing = connection;
      connection = null;
      if (closing) {
        if (finished) {
          await closing.quit().catch(() => closing.disconnect());
        } else {
          // Disconnecting (not quit(), which waits for replies) is what actually unblocks a stuck
          // close: the job's lock then expires and it is recovered as stalled.
          closing.disconnect();
        }
      }
    },

    health: () => ({ running, draining }),
  };
}
