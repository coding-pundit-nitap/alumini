import {
  ConflictError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import type { Refusal } from "../domain/connection";

/** Turns a domain refusal into the one AppError the boundary maps. Never returns. */
export function refuse(refusal: Refusal): never {
  switch (refusal.code) {
    case "NOT_FOUND":
      throw new NotFoundError();
    case "NOT_CONNECTION_RECIPIENT":
      throw new AuthorizationError({ code: "NOT_CONNECTION_RECIPIENT" });
    case "CONNECTION_COOLDOWN":
      throw new ConflictError("CONNECTION_COOLDOWN", {
        details: [{ eligibleAt: refusal.eligibleAt.toISOString() }],
      });
    default:
      throw new ConflictError(refusal.code);
  }
}

export const cannotConnectSelf = () =>
  new ValidationError({ code: "CANNOT_CONNECT_SELF" });
