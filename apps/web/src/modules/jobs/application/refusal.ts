import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import type { Refusal } from "../domain/job";

/**
 * Turns a domain refusal into the one AppError the boundary maps. Never
 * returns.
 */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_FOUND":
      throw new NotFoundError();
    case "NOT_OWNER":
      throw new AuthorizationError({ code: "NOT_OWNER" });
    case "SELF_REVIEW_FORBIDDEN":
      throw new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
    case "REVIEW_NOTE_REQUIRED":
      throw new ValidationError({ code: "REVIEW_NOTE_REQUIRED" });
    default:
      throw new ConflictError(refusal.code);
  }
}
