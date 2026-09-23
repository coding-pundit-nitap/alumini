import { z } from "zod";

const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** A GET form sends "" for every untouched field; that means "no filter". */
const dropEmpty = (input: unknown) =>
  input && typeof input === "object" && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ""))
    : input;

/** Filters for the audit read (spec A12-7). Shared by the API route and the page. */
export const auditQuerySchema = z.preprocess(
  dropEmpty,
  z
    .object({
      actorId: z.uuid().optional(),
      action: z.string().max(100).regex(ACTION).optional(),
      targetType: z
        .string()
        .max(50)
        .regex(/^[a-z_]+$/)
        .optional(),
      targetId: z.uuid().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      cursor: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
    .refine((q) => !q.from || !q.to || q.from < q.to, {
      message: "from must be before to",
      path: ["to"],
    })
);

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditCursor = { createdAt: Date; id: string };

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Opaque, URL-safe keyset cursor over (created_at, id). */
export function encodeAuditCursor(cursor: AuditCursor): string {
  return toBase64Url(
    JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id })
  );
}

const cursorShape = z.object({ c: z.iso.datetime(), i: z.uuid() });

/** Null for anything that is not a cursor this module issued. */
export function decodeAuditCursor(raw: string): AuditCursor | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const parsed = cursorShape.safeParse(JSON.parse(json));
    return parsed.success
      ? { createdAt: new Date(parsed.data.c), id: parsed.data.i }
      : null;
  } catch {
    return null;
  }
}
