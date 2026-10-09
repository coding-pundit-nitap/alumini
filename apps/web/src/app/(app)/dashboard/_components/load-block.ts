import { logger } from "@/infrastructure/observability";
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";

export type Loaded<T> =
  { status: "ok"; value: T } | { status: "absent" } | { status: "error" };

/**
 * A denial or missing record hides the block; any other error is logged and
 * shown inline.
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
