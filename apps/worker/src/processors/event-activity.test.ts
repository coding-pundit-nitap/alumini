import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createEventActivityProcessor } from "./event-activity.ts";

const context = (logger: ReturnType<typeof silentLogger>) => ({
  jobId: "j",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger,
});

describe("event activity processor", () => {
  it.each(["created", "cancelled"])(
    "logs event.%s.handled with ids only and succeeds",
    async (name) => {
      const logger = silentLogger();
      const info = vi.spyOn(logger, "info");
      await createEventActivityProcessor(name)(
        { v: 1, eventId: "e1", actorId: "a1" },
        context(logger)
      );
      expect(info).toHaveBeenCalledWith(`event.${name}.handled`, {
        metadata: { eventId: "e1", actorId: "a1" },
      });
    }
  );

  it.each(["registered", "registration-cancelled", "attendance-marked"])(
    "logs event.%s.handled with the registration ids",
    async (name) => {
      const logger = silentLogger();
      const info = vi.spyOn(logger, "info");
      await createEventActivityProcessor(name)(
        {
          v: 1,
          eventId: "e1",
          registrationId: "r1",
          userId: "u1",
          actorId: "a1",
        },
        context(logger)
      );
      expect(info).toHaveBeenCalledWith(`event.${name}.handled`, {
        metadata: {
          eventId: "e1",
          registrationId: "r1",
          userId: "u1",
          actorId: "a1",
        },
      });
    }
  );
});
