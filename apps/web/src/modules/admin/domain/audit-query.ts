import { z } from "zod";

const ACTION = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** A GET form sends "" for every untouched field; that means "no filter". */
export const dropEmpty = (input: unknown) =>
  input && typeof input === "object" && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([, v]) => v !== ""))
    : input;

/** Filters for the audit read. Shared by the API route and the page. */
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

export {
  type KeysetCursor as AuditCursor,
  encodeKeysetCursor as encodeAuditCursor,
  decodeKeysetCursor as decodeAuditCursor,
} from "./keyset-cursor";
