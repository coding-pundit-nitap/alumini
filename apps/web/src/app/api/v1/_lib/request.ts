import { z } from "zod";

import { NotFoundError, ValidationError } from "@/lib/errors";

const id = z.uuid();

/** A malformed id and an unknown one are the same answer. */
export function uuidParam(value: string): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new ValidationError({ code: "MALFORMED_REQUEST" });
  });
}

export function invalid(error: z.ZodError) {
  return new ValidationError({
    details: error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      code: "INVALID",
      message: issue.message,
    })),
  });
}
