/** One outbox row as the relay sees it. */
export type OutboxEventRow = {
  id: string;
  type: string;
  payload: unknown;
  requestId: string | null;
  createdAt: Date;
};

/** What the relay decided for a claimed batch. Rows in neither list stay unpublished. */
export type PublishResult = {
  published: readonly string[];
  quarantined: readonly { id: string; reason: string }[];
};

export type OutboxQuarantinedRow = {
  id: string;
  type: string;
  failedAt: Date;
  failureReason: string;
};

/** Implemented with Prisma in `packages/database/outbox`. Safe to run from several relays at once. */
export interface OutboxStore {
  /**
   * In one transaction: claims up to `limit` rows (`FOR UPDATE SKIP LOCKED`), publishes them, then marks
   * them published or quarantined. Nothing commits if `publish` throws. Unknown types are left for a
   * newer worker.
   */
  publishBatch(
    limit: number,
    knownTypes: readonly string[],
    publish: (rows: readonly OutboxEventRow[]) => Promise<PublishResult>
  ): Promise<number>;

  /** Age in seconds of the oldest unpublished, unquarantined row, or null when there is none. */
  oldestUnpublishedAgeSeconds(): Promise<number | null>;

  /** Deletes up to `limit` rows published before `cutoff`; returns how many. */
  pruneBefore(cutoff: Date, limit: number): Promise<number>;

  listQuarantined(limit: number): Promise<OutboxQuarantinedRow[]>;

  /** Returns quarantined rows (all, or only these ids) to the queue of unpublished rows. */
  releaseQuarantined(ids?: readonly string[]): Promise<number>;

  /** How many published rows since `since` a replay would re-publish. */
  countReplayable(since: Date, type?: string): Promise<number>;

  /** Marks published rows since `since` as unpublished again; returns how many. */
  replay(since: Date, type?: string): Promise<number>;

  /** How many unpublished, unquarantined rows created before `before` a settle would mark published. */
  countSettleable(before: Date, type?: string): Promise<number>;

  /**
   * After a restore: marks unpublished rows created before `before` as published, since their effects
   * may already have happened.
   */
  settle(before: Date, type?: string): Promise<number>;
}
