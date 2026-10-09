import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";

import type { Refusal } from "../domain/messaging";

/**
 * Turns a domain refusal into the one AppError the boundary maps. Never
 * returns.
 */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_FOUND":
      throw new NotFoundError();
    case "NOT_GROUP_ADMIN":
      throw new AuthorizationError({ code: "NOT_GROUP_ADMIN" });
    default:
      throw new ConflictError(refusal.code);
  }
}
