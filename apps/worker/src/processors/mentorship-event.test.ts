import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createMentorshipEventProcessor } from "./mentorship-event.ts";

const payload = {
  v: 1 as const,
  mentorshipId: "m1",
  mentorId: "mentor1",
  menteeId: "mentee1",
  actorId: "a1",
};

describe("mentorship event processor", () => {
  it.each([
    "requested",
    "accepted",
    "declined",
    "cancelled",
    "started",
    "completed",
  ] as const)(
    "logs mentorship.%s.handled with ids only and succeeds",
    async (event) => {
      const logger = silentLogger();
      const info = vi.spyOn(logger, "info");
      await createMentorshipEventProcessor(event)(payload, {
        jobId: "j",
        attempt: 1,
        requestId: null,
        signal: new AbortController().signal,
        logger,
      });
      expect(info).toHaveBeenCalledWith(`mentorship.${event}.handled`, {
        metadata: {
          mentorshipId: "m1",
          mentorId: "mentor1",
          menteeId: "mentee1",
          actorId: "a1",
        },
      });
    }
  );
});
