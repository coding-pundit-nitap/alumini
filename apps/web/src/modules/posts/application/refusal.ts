import { AuthorizationError, NotFoundError } from "@/lib/errors";

import type { Refusal } from "../domain/posts";

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
  }
}
