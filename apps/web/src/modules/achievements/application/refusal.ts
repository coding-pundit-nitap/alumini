import { AuthorizationError, ConflictError } from "@/lib/errors";

import type { Refusal } from "../domain/achievement";

/** Turns a domain refusal into the one AppError the boundary maps. Never returns. */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_OWNER":
      throw new AuthorizationError({ code: "NOT_OWNER" });
    case "NOT_REVIEWER":
      throw new AuthorizationError({ code: "NOT_REVIEWER" });
    case "SELF_REVIEW_FORBIDDEN":
      throw new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
    default:
      throw new ConflictError(refusal.code);
  }
}
