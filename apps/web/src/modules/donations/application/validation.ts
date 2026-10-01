import type { z } from "zod";

import { ValidationError } from "@/lib/errors";

/** One detail per failing field (API spec §1.5); `(query)` when the issue has no path. */
export const toValidationError = (error: z.ZodError) =>
  new ValidationError({
    details: error.issues.map((issue) => ({
      field: issue.path.join(".") || "(query)",
      code: issue.code === "unrecognized_keys" ? "UNKNOWN_FIELD" : "INVALID",
      message: issue.message,
    })),
  });
