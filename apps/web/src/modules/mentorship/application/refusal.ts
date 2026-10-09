import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import type { Refusal } from "../domain/mentorship";

/**
 * Turns a domain refusal into the one AppError the boundary maps. Never
 * returns.
 */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_FOUND":
      throw new NotFoundError();
    case "NOT_MENTORSHIP_MENTOR":
      throw new AuthorizationError({ code: "NOT_MENTORSHIP_MENTOR" });
    default:
      throw new ConflictError(refusal.code);
  }
}

export const cannotMentorSelf = () =>
  new ValidationError({ code: "CANNOT_MENTOR_SELF" });
