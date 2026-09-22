import { z } from "zod";

/**
 * The posts rules, pure (FR-FEED-001…004, spec C-2…C-4, C-10). A refusal of `NOT_FOUND` means "not yours to
 * know about": a deleted post and a blocked pair read the same, so a block is never revealed either direction.
 */
export const REACTION_TYPES = [
  "LIKE",
  "CELEBRATE",
  "SUPPORT",
  "INSIGHTFUL",
] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const postInput = z
  .object({
    content: z.string().trim().min(1).max(5000),
    imageUrls: z.array(z.uuid()).max(4).optional(),
    linkUrl: z
      .url()
      .refine((u) => u.startsWith("https://"), "linkUrl must be https")
      .optional(),
  })
  .strict();

export const commentInput = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();

export const reactInput = z.object({ type: z.enum(REACTION_TYPES) }).strict();

export type Refusal = { code: "NOT_FOUND" | "NOT_OWNER" };
type Decision = { ok: true } | ({ ok: false } & Refusal);

/** May `actorId` comment or react on this post? `block` is "is there a BLOCKED row between actor and author". */
export function decideInteract(
  post: { id: string; authorId: string; deleted: boolean },
  block: boolean | null,
  actorId: string
): Decision {
  if (post.deleted) return { ok: false, code: "NOT_FOUND" };
  if (block) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}

/** May `actorId` delete this post/comment? Only its author (moderator removal is a separate path, C-9). */
export function decideOwn(authorId: string, actorId: string): Decision {
  return authorId === actorId ? { ok: true } : { ok: false, code: "NOT_OWNER" };
}
