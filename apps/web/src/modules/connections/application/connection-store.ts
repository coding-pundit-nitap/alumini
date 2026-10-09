import type { Tick } from "@/lib/role-tick";
import type {
  ConnectionPatch,
  ConnectionRow,
  ConnectionState,
} from "../domain/connection";

/**
 * The `connection.*` events the outbox carries (contracts in `@nitap/jobs`).
 * Ids only.
 */
export type ConnectionEvent = {
  type: "connection.requested" | "connection.accepted";
  payload: { v: 1; connectionId: string; actorId: string; recipientId: string };
};

export type NewConnection = ConnectionPatch & {
  userAId: string;
  userBId: string;
};

/**
 * All writes go through one transaction, so a row and its outbox event commit
 * together.
 */
export type ConnectionTx = {
  findByPair(userAId: string, userBId: string): Promise<ConnectionRow | null>;
  findById(id: string): Promise<ConnectionRow | null>;
  /** The member's account state, or null when there is no such user. */
  accountState(userId: string): Promise<string | null>;
  /**
   * Inserts the pair; null when the pair already exists (a concurrent request
   * won). Never throws for that.
   */
  insert(input: NewConnection): Promise<ConnectionRow | null>;
  /**
   * Guarded: only a row still in `from` moves. Null when it had already changed
   * (or is gone).
   */
  update(
    id: string,
    from: ConnectionState,
    patch: ConnectionPatch
  ): Promise<ConnectionRow | null>;
  /** Guarded like `update`. False when the row had already changed. */
  remove(id: string, from: ConnectionState): Promise<boolean>;
  enqueue(event: ConnectionEvent): Promise<void>;
  /** Writes the audit row in the same transaction. Ids only. */
  audit(entry: ConnectionAuditEntry): Promise<void>;
};

/**
 * Block and unblock leave a trace: a moderator may need to know who blocked
 * whom, and when.
 */
export type ConnectionAuditEntry = {
  action: "connection.blocked" | "connection.unblocked";
  actorId: string;
  targetUserId: string;
  connectionId: string;
};

/**
 * One committed outcome, for logs and metrics. Called after the transaction,
 * never inside it.
 */
export type ConnectionOutcome =
  | "requested"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "removed"
  | "blocked"
  | "unblocked";
export type ConnectionObserver = (
  outcome: ConnectionOutcome,
  connectionId: string
) => void;

export type ConnectionStore = {
  transaction<T>(work: (tx: ConnectionTx) => Promise<T>): Promise<T>;
};

export type ListedConnection = {
  id: string;
  state: ConnectionState;
  /** Relative to the caller: who started it. */
  direction: "INCOMING" | "OUTGOING";
  user: { id: string; fullName: string; hasPhoto: boolean; tick?: Tick | null };
  requestedAt: Date;
  respondedAt: Date | null;
};

export type ListFilter = {
  /** Never REJECTED: a rejection is not shown to the member who was rejected. */
  state: Exclude<ConnectionState, "REJECTED">;
  direction?: "INCOMING" | "OUTGOING";
  limit: number;
  after?: { requestedAt: Date; id: string };
};

/** Reads outside a transaction. */
export type ConnectionQueries = {
  between(viewerId: string, otherId: string): Promise<ConnectionRow | null>;
  /**
   * Newest first, at most `limit` rows. A BLOCKED listing holds only the
   * caller's own blocks.
   */
  list(userId: string, filter: ListFilter): Promise<ListedConnection[]>;
};
