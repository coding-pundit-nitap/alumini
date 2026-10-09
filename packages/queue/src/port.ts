import type { JobDefinition } from "@nitap/jobs";

/** What the relay and the worker need from a queue. BullMQ is one adapter; nothing outside `packages/queue` imports it. */
export interface QueuePort {
  /** Idempotent on `jobId`. Rejects quickly if the queue is unreachable. */
  add(
    job: JobDefinition,
    payload: unknown,
    options: { jobId: string; requestId?: string | null }
  ): Promise<void>;

  /** Registers a repeating job under a fixed id, so N workers do not multiply it. Safe to call on every start. */
  upsertSchedule(
    job: JobDefinition,
    schedule: { id: string; everyMs: number; payload: unknown }
  ): Promise<void>;

  close(): Promise<void>;
}
