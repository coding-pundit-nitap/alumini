import { AuthorizationError, ConflictError } from "@/lib/errors";

import type { Refusal } from "../domain/moderation";

/** Turns a domain refusal into the one AppError the boundary maps. Never returns. */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "SELF_REVIEW_FORBIDDEN":
      throw new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
    default:
      throw new ConflictError(refusal.code);
  }
}
