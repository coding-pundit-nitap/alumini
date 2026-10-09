import type { JobDefinition, OutboxStore } from "@nitap/jobs";
import type { Logger, Metrics } from "@nitap/observability";

import type { QueuePort } from "./port.ts";
import { withTimeout } from "./timeout.ts";

export type RelayOptions = {
  store: OutboxStore;
  queue: QueuePort;
  /**
   * Event type → job definition. Only these types are claimed (others wait for
   * a newer worker).
   */
  events: Readonly<Record<string, JobDefinition>>;
  logger: Logger;
  metrics: Metrics;
  pollIntervalMs?: number;
  batchSize?: number;
  /** Bound on one `queue.add`, so a hung Redis cannot hold row locks for long. */
  enqueueTimeoutMs?: number;
  maxBackoffMs?: number;
  now?: () => Date;
  /** Injectable for tests; must resolve early when the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

export type RelayRunResult = {
  claimed: number;
  published: number;
  quarantined: number;
};

export type Relay = {
  /**
   * One claim → enqueue → commit cycle. Rejects if the queue or the database
   * failed (nothing is committed).
   */
  runOnce(): Promise<RelayRunResult>;
  start(): void;
  /** Stops polling after the current batch finishes. */
  stop(): Promise<void>;
  health(): { lastPollAt: Date | null; consecutiveFailures: number };
};

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

export function createRelay(options: RelayOptions): Relay {
  const {
    store,
    queue,
    events,
    logger,
    metrics,
    pollIntervalMs = 1_000,
    batchSize = 100,
    enqueueTimeoutMs = 5_000,
    maxBackoffMs = 30_000,
    now = () => new Date(),
    sleep = abortableSleep,
  } = options;

  let lastPollAt: Date | null = null;
  let consecutiveFailures = 0;
  let abort: AbortController | null = null;
  let loop: Promise<void> | null = null;

  async function runOnce(): Promise<RelayRunResult> {
    let published = 0;
    let quarantined = 0;

    const claimed = await store.publishBatch(
      batchSize,
      Object.keys(events),
      async (rows) => {
        const done: string[] = [];
        const bad: { id: string; reason: string }[] = [];
        for (const row of rows) {
          const definition = events[row.type];
          if (!definition) continue; // the store only claims known types
          const parsed = definition.schema.safeParse(row.payload);
          if (!parsed.success) {
            // Paths and messages only; never the values (they can hold an address or a token).
            const problems = parsed.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; ");
            bad.push({
              id: row.id,
              reason: `Invalid payload for ${row.type}: ${problems}`,
            });
            continue;
          }
          // A failure here throws out of the callback: the store rolls the whole batch back and the
          // rows stay unpublished. Rows enqueued before the failure are deduplicated by jobId next time.
          await withTimeout(
            queue.add(definition, parsed.data, {
              jobId: row.id,
              requestId: row.requestId,
            }),
            enqueueTimeoutMs,
            "enqueue"
          );
          done.push(row.id);
        }
        published = done.length;
        quarantined = bad.length;
        return { published: done, quarantined: bad };
      }
    );

    if (published > 0)
      metrics.increment("outbox_relay_published_total", {}, published);
    if (quarantined > 0) {
      metrics.increment("outbox_relay_quarantined_total", {}, quarantined);
      logger.error("outbox.event.quarantined", {
        metadata: { count: quarantined },
      });
    }
    const age = await store.oldestUnpublishedAgeSeconds();
    metrics.gauge("outbox_oldest_unpublished_age_seconds", age ?? 0);

    return { claimed, published, quarantined };
  }

  async function run(signal: AbortSignal) {
    while (!signal.aborted) {
      let wait = pollIntervalMs;
      try {
        const result = await runOnce();
        lastPollAt = now();
        consecutiveFailures = 0;
        if (result.claimed >= batchSize) wait = 0; // more waiting: go again at once
      } catch (error) {
        consecutiveFailures += 1;
        wait = Math.min(
          maxBackoffMs,
          pollIntervalMs * 2 ** Math.min(consecutiveFailures, 10)
        );
        metrics.increment("outbox_relay_errors_total");
        logger.error("outbox.relay.poll_failed", {
          error,
          metadata: { consecutiveFailures },
        });
      }
      if (wait > 0) await sleep(wait, signal);
    }
  }

  return {
    runOnce,
    start() {
      if (loop) return;
      abort = new AbortController();
      loop = run(abort.signal);
    },
    async stop() {
      abort?.abort();
      await loop;
      loop = null;
    },
    health: () => ({ lastPollAt, consecutiveFailures }),
  };
}
