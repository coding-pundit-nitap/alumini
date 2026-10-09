import type { ZodType } from "zod";

import { ValidationError } from "@/lib/errors";

/** Parses untrusted input; a failure is a ValidationError carrying one detail per field. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError({
    details: result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      code: "INVALID",
      message: issue.message,
    })),
  });
}
