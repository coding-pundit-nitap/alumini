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
 * A failed count is reported through `failed` instead of reading as zero; an
 * absent one is zero.
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
