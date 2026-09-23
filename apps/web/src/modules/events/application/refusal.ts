import { AuthorizationError, ConflictError, NotFoundError } from "@/lib/errors";

import type { Refusal } from "../domain/event";

/** Turns a domain refusal into the one AppError the boundary maps. Never returns. */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_FOUND":
      throw new NotFoundError();
    case "PERMISSION_DENIED":
      throw new AuthorizationError();
    default:
      throw new ConflictError(refusal.code);
  }
}
