import { z } from "zod";

/**
 * The messaging rules, pure (FR-MSG-001…005). A refusal of `NOT_FOUND` means "not yours to know about", so
 * a blocked member learns nothing (same stance as connections, ADR-024).
 */
export const MAX_GROUP_SIZE = 20;
export const MAX_BODY = 4000;

export const messageInput = z
  .object({
    body: z.string().trim().min(1).max(MAX_BODY),
    clientMessageId: z.uuid(),
  })
  .strict();

export const groupInput = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    memberIds: z
      .array(z.uuid())
      .min(2)
      .max(MAX_GROUP_SIZE - 1)
      .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
        {
          message: "Members must be distinct.",
        }
      ),
  })
  .strict();

export const reportInput = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

/** A decimal string: `seq` is a BIGINT and must not pass through a JavaScript number. */
export const readInput = z
  .object({ upToSeq: z.string().regex(/^\d{1,18}$/) })
  .strict();

/** `min:max` of the two lower-cased ids: the same key for A→B and B→A (unique index `uq_conversation_direct_pair`). */
export function directPairKey(x: string, y: string): string {
  const [a, b] = [x.toLowerCase(), y.toLowerCase()].sort();
  return `${a}:${b}`;
}

export type Refusal = {
  code:
    | "NOT_FOUND"
    | "MESSAGE_BLOCKED"
    | "GROUP_FULL"
    | "NOT_GROUP_ADMIN"
    | "PARTICIPANT_UNAVAILABLE";
};
type Decision = { ok: true } | ({ ok: false } & Refusal);

/** May `viewerId` write to a 1:1 whose pair has this block row (if any)? The blocker is told; the blocked is not. */
export function decideDirectAccess(
  block: { blockedById: string } | null,
  viewerId: string
): Decision {
  if (!block) return { ok: true };
  return {
    ok: false,
    code: block.blockedById === viewerId ? "MESSAGE_BLOCKED" : "NOT_FOUND",
  };
}

export function decideManage(createdById: string, actorId: string): Decision {
  return createdById === actorId
    ? { ok: true }
    : { ok: false, code: "NOT_GROUP_ADMIN" };
}

export function decideAddCapacity(currentCount: number): Decision {
  return currentCount < MAX_GROUP_SIZE
    ? { ok: true }
    : { ok: false, code: "GROUP_FULL" };
}

/** A message as a member reads it. A hidden message keeps its place and loses its text (spec C12-4). */
export type ListedMessage = {
  id: string;
  seq: string;
  senderId: string;
  createdAt: Date;
} & ({ hidden: false; body: string } | { hidden: true; body: null });

export function toListedMessage(row: {
  id: string;
  seq: string;
  senderId: string;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
}): ListedMessage {
  const { id, seq, senderId, createdAt } = row;
  return row.hiddenAt
    ? { id, seq, senderId, createdAt, hidden: true, body: null }
    : { id, seq, senderId, createdAt, hidden: false, body: row.body };
}
