import type {
  JobEventPayload,
  JobExpiredPayload,
  JobPublishedPayload,
} from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

export type JobEventDeps = {
  deliver: DeliverNotification;
  /** Re-reads the current email; null skips email (account may be deactivated). */
  findEmail: (userId: string) => Promise<string | null>;
  /** Only used for "submitted": holders of job.approve, resolved at delivery time. */
  findModerators?: (permission: "job.approve") => Promise<string[]>;
};

type Payload = JobEventPayload | JobPublishedPayload | JobExpiredPayload;

/** Handles job.submitted/published/rejected/closed/expired. Registered in compose.ts. */
export function createJobEventProcessor(
  action: "submitted" | "published" | "rejected" | "closed" | "expired",
  deps: JobEventDeps
): JobProcessor<Payload> {
  return async (payload, { jobId: eventId }) => {
    const type = `job.${action}`;
    const send = async (recipientId: string, withEmail: boolean) =>
      deps.deliver({
        eventId,
        type,
        category: "ENGAGEMENT",
        recipientId,
        payload: { jobId: payload.jobId },
        emailTo: withEmail
          ? ((await deps.findEmail(recipientId)) ?? undefined)
          : undefined,
      });

    if (action === "submitted") {
      for (const id of (await deps.findModerators?.("job.approve")) ?? []) {
        // The submitter must not be notified of their own submission.
        if (
          id === payload.postedBy ||
          id === (payload as JobEventPayload).actorId
        )
          continue;
        await send(id, false); // in-app only (spec catalogue)
      }
      return;
    }
    // Spec catalogue: only published/rejected email the poster; closed and expired are in-app only.
    if (
      action === "closed" &&
      "actorId" in payload &&
      payload.actorId === payload.postedBy
    )
      return; // self-close: no notification
    await send(
      payload.postedBy,
      action === "published" || action === "rejected"
    );
  };
}
