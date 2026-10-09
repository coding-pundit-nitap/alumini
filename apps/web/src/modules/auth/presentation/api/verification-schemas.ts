import { z } from "zod";

/** The only form fields the evidence action reads (see `pickFields`). */
export const EVIDENCE_FIELDS = [
  "rollNumber",
  "departmentId",
  "degreeId",
  "graduationYear",
  "supportingInfo",
] as const;

/**
 * Strict: a field outside this list, such as a forged `userId`, fails
 * validation.
 */
export const evidenceSchema = z
  .object({
    rollNumber: z
      .string()
      .trim()
      .min(1, "Enter your roll or enrolment number.")
      .max(50, "Use at most 50 characters."),
    departmentId: z.uuid("Choose your department."),
    degreeId: z.uuid("Choose your degree."),
    graduationYear: z.coerce
      .number("Choose your graduation year.")
      .int("Choose your graduation year.")
      .min(2010, "Choose a year from 2010 onwards.")
      .max(2100, "Choose a valid year."),
    supportingInfo: z
      .string()
      .trim()
      .max(2000, "Use at most 2000 characters.")
      .optional()
      .transform((value) => value || null),
  })
  .strict();

export const DECISION_FIELDS = ["requestId", "decision", "note"] as const;

export const decisionSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z
      .string()
      .trim()
      .max(1000, "Use at most 1000 characters.")
      .optional(),
  })
  .strict();
