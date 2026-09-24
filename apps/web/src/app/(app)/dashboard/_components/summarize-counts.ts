import type { AttentionCounts } from "./attention-tiles";
import { COUNT_CAP } from "./attention-tiles";
import type { Loaded } from "./load-block";

export type CountResults = {
  connectionRequests: Loaded<number>;
  unreadMessages: Loaded<number>;
  mentorshipRequests: Loaded<number>;
  unreadNotifications: Loaded<number>;
};

/**
 * H-6: a real failure in one count must not silently read as "zero" — it's excluded from its tile
 * and `failed` tells the caller to render an inline error. A missing/denied count (`absent`) is a
 * legitimate zero, not a failure.
 */
export function summarizeCounts(results: CountResults): {
  counts: AttentionCounts;
  failed: boolean;
} {
  let failed = false;
  const value = (result: Loaded<number>) => {
    if (result.status === "ok") return result.value;
    if (result.status === "error") failed = true;
    return 0;
  };
  return {
    counts: {
      connectionRequests: value(results.connectionRequests),
      unreadMessages: Math.min(value(results.unreadMessages), COUNT_CAP),
      mentorshipRequests: value(results.mentorshipRequests),
      unreadNotifications: value(results.unreadNotifications),
    },
    failed,
  };
}
