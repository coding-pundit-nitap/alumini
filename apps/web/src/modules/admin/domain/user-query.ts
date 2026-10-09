import { z } from "zod";

import {
  CHAPTER_SCOPABLE_PERMISSIONS,
  PERMISSIONS,
} from "@nitap/database/permissions";

import { dropEmpty } from "./audit-query";
import { SUSPENSION_REASONS, TARGET_STATES } from "./lifecycle";

const uuid = z.uuid();
/** The same strict check the API routes apply to path ids (z.uuid); anything else is simply not found. */
export const isUuid = (value: unknown): value is string =>
  uuid.safeParse(value).success;

const STATES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

/** Filters for the user list. Shared by the API route and the page. */
export const userListQuerySchema = z.preprocess(
  dropEmpty,
  z
    .object({
      q: z.string().trim().min(1).max(100).optional(),
      state: z.enum(STATES).optional(),
      role: z
        .string()
        .max(50)
        .regex(/^[A-Z_]+$/)
        .optional(),
      cursor: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .strict()
);
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const accountStateInputSchema = z
  .object({
    accountState: z.enum(TARGET_STATES),
    reason: z.enum(SUSPENSION_REASONS).optional(),
  })
  .strict()
  .refine((v) => v.accountState === "VERIFIED" || v.reason !== undefined, {
    message: "Choose a reason.",
    path: ["reason"],
  });
export type AccountStateInput = z.infer<typeof accountStateInputSchema>;

export const roleInputSchema = z
  .object({
    role: z
      .string()
      .max(50)
      .regex(/^[A-Z_]+$/),
  })
  .strict();

const KNOWN: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));
const SCOPABLE: ReadonlySet<string> = new Set(CHAPTER_SCOPABLE_PERMISSIONS);

export const grantInputSchema = z
  .object({
    permission: z.string().refine((p) => KNOWN.has(p), "Unknown permission."),
    scope: z.enum(["GLOBAL", "CHAPTER"]),
    chapterId: z.uuid().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict()
  .refine((v) => (v.scope === "CHAPTER") === (v.chapterId !== undefined), {
    message: "Choose a chapter for a chapter grant, and none for a global one.",
    path: ["chapterId"],
  })
  .refine((v) => v.scope === "GLOBAL" || SCOPABLE.has(v.permission), {
    message: "This permission cannot be chapter-scoped.",
    path: ["scope"],
  });
export type GrantInput = z.infer<typeof grantInputSchema>;
