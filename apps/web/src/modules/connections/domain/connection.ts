/**
 * One row per unordered pair; `NONE` means no row. `NOT_FOUND` means "not yours to know about", so a
 * blocked member learns nothing.
 */
export type ConnectionState = "PENDING" | "ACCEPTED" | "REJECTED" | "BLOCKED";

export type ConnectionRow = {
  id: string;
  /** Canonical order: `userAId < userBId` (a database CHECK repeats it). */
  userAId: string;
  userBId: string;
  requestedById: string;
  blockedById: string | null;
  state: ConnectionState;
  requestedAt: Date;
  respondedAt: Date | null;
};

/** The fields a transition may change. Written whole, so no transition can leave a stale field behind. */
export type ConnectionPatch = Pick<
  ConnectionRow,
  "state" | "requestedById" | "requestedAt" | "respondedAt" | "blockedById"
>;

/** How long a rejected requester waits before asking the same member again. */
export const REREQUEST_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** UUIDs compare bytewise in PostgreSQL, which for lower-case hex equals string order. */
export function canonicalPair(x: string, y: string) {
  const [a, b] = [x.toLowerCase(), y.toLowerCase()].sort();
  return { userAId: a as string, userBId: b as string };
}

export const isParty = (row: ConnectionRow, userId: string) =>
  row.userAId === userId || row.userBId === userId;

export const otherParty = (row: ConnectionRow, userId: string) =>
  row.userAId === userId ? row.userBId : row.userAId;

export type Refusal =
  | { code: "NOT_FOUND" | "CONNECTION_EXISTS" | "USER_BLOCKED" }
  | { code: "INVALID_STATE_TRANSITION" | "NOT_CONNECTION_RECIPIENT" }
  | { code: "CONNECTION_COOLDOWN"; eligibleAt: Date };

type Decision<T> = ({ ok: true } & T) | ({ ok: false } & Refusal);

const refuse = (refusal: Refusal): { ok: false } & Refusal => ({
  ok: false,
  ...refusal,
});

/** May `requesterId` ask the other member? `create` means no row exists; `reopen` recycles a rejected one. */
export function decideRequest(
  existing: ConnectionRow | null,
  requesterId: string,
  now: Date
): Decision<{ action: "create" | "reopen"; patch?: ConnectionPatch }> {
  if (!existing) return { ok: true, action: "create" };

  switch (existing.state) {
    case "PENDING":
    case "ACCEPTED":
      return refuse({ code: "CONNECTION_EXISTS" });
    case "BLOCKED":
      return refuse({
        code:
          existing.blockedById === requesterId ? "USER_BLOCKED" : "NOT_FOUND",
      });
    case "REJECTED": {
      // Only the rejected side waits; whoever rejected may ask at once.
      const eligibleAt = new Date(
        (existing.respondedAt ?? existing.requestedAt).getTime() +
          REREQUEST_COOLDOWN_MS
      );
      if (existing.requestedById === requesterId && now < eligibleAt) {
        return refuse({ code: "CONNECTION_COOLDOWN", eligibleAt });
      }
      return {
        ok: true,
        action: "reopen",
        patch: {
          state: "PENDING",
          requestedById: requesterId,
          requestedAt: now,
          respondedAt: null,
          blockedById: null,
        },
      };
    }
  }
}

/** Accept or reject a request: recipient only, PENDING only. */
export function decideRespond(
  row: ConnectionRow,
  actorId: string,
  to: "ACCEPTED" | "REJECTED",
  now: Date
): Decision<{ patch: ConnectionPatch }> {
  if (!isParty(row, actorId) || row.state === "BLOCKED") {
    return refuse({ code: "NOT_FOUND" });
  }
  if (row.requestedById === actorId) {
    return refuse({ code: "NOT_CONNECTION_RECIPIENT" });
  }
  if (row.state !== "PENDING") {
    return refuse({ code: "INVALID_STATE_TRANSITION" });
  }
  return {
    ok: true,
    patch: {
      state: to,
      requestedById: row.requestedById,
      requestedAt: row.requestedAt,
      respondedAt: now,
      blockedById: null,
    },
  };
}

export type RemoveOutcome = "cancelled" | "removed" | "unblocked";

/** A REJECTED row is never deletable, or the rejected side could skip the cooldown. */
export function decideRemove(
  row: ConnectionRow,
  actorId: string
): Decision<{ outcome: RemoveOutcome }> {
  if (!isParty(row, actorId)) return refuse({ code: "NOT_FOUND" });
  switch (row.state) {
    case "BLOCKED":
      return row.blockedById === actorId
        ? { ok: true, outcome: "unblocked" }
        : refuse({ code: "NOT_FOUND" });
    case "ACCEPTED":
      return { ok: true, outcome: "removed" };
    case "PENDING":
      return row.requestedById === actorId
        ? { ok: true, outcome: "cancelled" }
        : refuse({ code: "INVALID_STATE_TRANSITION" });
    case "REJECTED":
      return refuse({ code: "INVALID_STATE_TRANSITION" });
  }
}

/** Block a member, with or without a prior row. Blocking twice is a no-op; a blocked member cannot block back. */
export function decideBlock(
  existing: ConnectionRow | null,
  actorId: string,
  now: Date
): Decision<{ action: "create" | "update" | "noop"; patch: ConnectionPatch }> {
  const patch: ConnectionPatch = {
    state: "BLOCKED",
    requestedById: existing?.requestedById ?? actorId,
    requestedAt: existing?.requestedAt ?? now,
    respondedAt: now,
    blockedById: actorId,
  };
  if (!existing) return { ok: true, action: "create", patch };
  if (existing.state === "BLOCKED") {
    return existing.blockedById === actorId
      ? { ok: true, action: "noop", patch }
      : refuse({ code: "NOT_FOUND" });
  }
  return { ok: true, action: "update", patch };
}

/** What the users module needs to know: `blocked` in either direction hides both profiles. */
export type Relation = "none" | "connected" | "blocked";

export function relationOf(row: ConnectionRow | null): Relation {
  if (row?.state === "BLOCKED") return "blocked";
  return row?.state === "ACCEPTED" ? "connected" : "none";
}

/** A row as one member sees it. A rejection is never shown: it reads as `NONE`, so the requester is not told. */
export type ConnectionStatus =
  | { state: "NONE" }
  | {
      state: "OUTGOING" | "INCOMING" | "CONNECTED" | "BLOCKED_BY_ME";
      connectionId: string;
    };

export function statusFor(
  row: ConnectionRow | null,
  viewerId: string
): ConnectionStatus {
  if (!row) return { state: "NONE" };
  switch (row.state) {
    case "PENDING":
      return {
        state: row.requestedById === viewerId ? "OUTGOING" : "INCOMING",
        connectionId: row.id,
      };
    case "ACCEPTED":
      return { state: "CONNECTED", connectionId: row.id };
    case "BLOCKED":
      return row.blockedById === viewerId
        ? { state: "BLOCKED_BY_ME", connectionId: row.id }
        : { state: "NONE" };
    case "REJECTED":
      return { state: "NONE" };
  }
}
