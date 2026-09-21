import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createConnectionEventProcessor } from "./connection-event.ts";

const payload = {
  v: 1 as const,
  connectionId: "c1",
  actorId: "a1",
  recipientId: "r1",
};

describe("connection event processor", () => {
  it.each(["requested", "accepted"] as const)(
    "logs connection.%s.handled with ids only and succeeds",
    async (event) => {
      const logger = silentLogger();
      const info = vi.spyOn(logger, "info");
      await createConnectionEventProcessor(event)(payload, {
        jobId: "j",
        attempt: 1,
        requestId: null,
        signal: new AbortController().signal,
        logger,
      });
      expect(info).toHaveBeenCalledWith(`connection.${event}.handled`, {
        metadata: {
          connectionId: "c1",
          actorId: "a1",
          recipientId: "r1",
        },
      });
    }
  );
});
