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

/**
 * The persistence port for the outbox. `packages/database/outbox` implements it with Prisma; `packages/queue`
 * consumes it without knowing about Prisma. Every method is safe to run from several relays at once.
 */
export interface OutboxStore {
  /**
   * In ONE transaction: claim up to `limit` unpublished rows of the given types (`FOR UPDATE SKIP LOCKED`,
   * oldest first), let `publish` act on them, then mark the returned ids published and quarantine the
   * returned failures. If `publish` throws, nothing is committed. Returns how many rows were claimed.
   * Rows of a type not in `knownTypes` are never claimed (a newer worker will).
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
   * After a database restore: marks unpublished, unquarantined rows created before `before` (the restore
   * target) as published without publishing them, because their effects may already have happened after that
   * point (reliability §7.3 step 7). Returns how many.
   */
  settle(before: Date, type?: string): Promise<number>;
}
