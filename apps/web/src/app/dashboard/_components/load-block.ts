import { logger } from "@/infrastructure/observability";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";

export type Loaded<T> =
  { status: "ok"; value: T } | { status: "absent" } | { status: "error" };

/**
 * H-6: one block's failure stays in that block. A denial or a missing record means "this block does not
 * apply to you"; anything else is a real failure, logged and shown as an inline error.
 */
export async function loadBlock<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { status: "ok", value: await load() };
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof NotFoundError
    ) {
      return { status: "absent" };
    }
    logger.warn("dashboard.block_failed", { error });
    return { status: "error" };
  }
}
