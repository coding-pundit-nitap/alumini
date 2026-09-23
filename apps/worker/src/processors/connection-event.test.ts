import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import { createConnectionEventProcessor } from "./connection-event.ts";

const payload = {
  v: 1 as const,
  connectionId: "c1",
  actorId: "a1",
  recipientId: "r1",
};

const ctx = () => ({
  jobId: "e1",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});

const deps = (isBlocked = false) => ({
  deliver: vi.fn(async () => {}),
  findEmail: vi.fn(async () => "r@nitap.ac.in" as string | null),
  blocked: vi.fn(async () => isBlocked),
});

describe("connection event processor", () => {
  it.each(["requested", "accepted"] as const)(
    "delivers connection.%s to the recipient with their email",
    async (event) => {
      const d = deps();
      await createConnectionEventProcessor(event, d)(payload, ctx());
      expect(d.blocked).toHaveBeenCalledWith("a1", "r1");
      expect(d.deliver).toHaveBeenCalledWith({
        eventId: "e1",
        type: `connection.${event}`,
        category: "ENGAGEMENT",
        recipientId: "r1",
        payload: { connectionId: "c1" },
        emailTo: "r@nitap.ac.in",
      });
    }
  );

  it("omits email when the recipient has no verified account", async () => {
    const d = deps();
    d.findEmail.mockResolvedValue(null);
    await createConnectionEventProcessor("requested", d)(payload, ctx());
    expect(d.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ emailTo: undefined })
    );
  });

  it("skips delivery if a block exists since the event fired", async () => {
    const d = deps(true);
    await createConnectionEventProcessor("requested", d)(payload, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });
});
