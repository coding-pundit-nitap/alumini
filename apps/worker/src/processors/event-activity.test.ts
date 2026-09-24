import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import { createEventActivityProcessor } from "./event-activity.ts";

const ctx = (jobId = "j1") => ({
  jobId,
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});

const lifecycle = { v: 1 as const, eventId: "ev1", actorId: "organizer-1" };
const registration = {
  v: 1 as const,
  eventId: "ev1",
  registrationId: "r1",
  userId: "user-1",
  actorId: "user-1",
};

const deps = (
  registrants: string[] = ["reg-1", "reg-2"],
  isBlocked: (b: string) => boolean = () => false
) => ({
  deliver: vi.fn<DeliverNotification>(async () => {}),
  findEmail: vi.fn(async () => "e@nitap.ac.in" as string | null),
  findActiveRegistrants: vi.fn(async () => registrants),
  blocked: vi.fn(async (_a: string, b: string) => isBlocked(b)),
});

describe("event activity processor", () => {
  it("cancelled fans out to every active registrant with email", async () => {
    const d = deps();
    await createEventActivityProcessor("cancelled", d)(lifecycle, ctx());
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId)).toEqual([
      "reg-1",
      "reg-2",
    ]);
    expect(d.deliver.mock.calls[0]![0]).toMatchObject({
      eventId: "j1",
      type: "event.cancelled",
      payload: { eventId: "ev1" },
      emailTo: "e@nitap.ac.in",
    });
  });

  it("cancelled skips the actor and blocked registrants", async () => {
    const d = deps(["organizer-1", "reg-1", "reg-2"], (b) => b === "reg-2");
    await createEventActivityProcessor("cancelled", d)(lifecycle, ctx());
    expect(d.deliver.mock.calls.map((c) => c[0].recipientId)).toEqual([
      "reg-1",
    ]);
  });

  it("cancelled with no registrants is a no-op", async () => {
    const d = deps([]);
    await createEventActivityProcessor("cancelled", d)(lifecycle, ctx());
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("redelivery of the same job passes identical deliver input per recipient", async () => {
    const d = deps();
    const p = createEventActivityProcessor("cancelled", d);
    await p(lifecycle, ctx("same"));
    await p(lifecycle, ctx("same"));
    const [a, b] = [
      d.deliver.mock.calls.slice(0, 2),
      d.deliver.mock.calls.slice(2),
    ];
    expect(b).toEqual(a);
  });

  it.each(["created", "attendance-marked"])(
    "%s notifies no one",
    async (name) => {
      const d = deps();
      await createEventActivityProcessor(name, d)(
        name === "created" ? lifecycle : registration,
        ctx()
      );
      expect(d.deliver).not.toHaveBeenCalled();
      expect(d.findActiveRegistrants).not.toHaveBeenCalled();
    }
  );

  it("registered notifies the registrant (self-registration confirms)", async () => {
    const d = deps();
    await createEventActivityProcessor("registered", d)(registration, ctx());
    expect(d.deliver).toHaveBeenCalledTimes(1);
    expect(d.deliver.mock.calls[0]![0]).toMatchObject({
      recipientId: "user-1",
      type: "event.registered",
      emailTo: "e@nitap.ac.in",
    });
  });

  it("registration-cancelled by the registrant notifies no one", async () => {
    const d = deps();
    await createEventActivityProcessor("registration-cancelled", d)(
      registration,
      ctx()
    );
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("registration-cancelled by someone else notifies the registrant in-app (spec D12-7)", async () => {
    const d = deps();
    await createEventActivityProcessor("registration-cancelled", d)(
      { ...registration, actorId: "organizer-1" },
      ctx()
    );
    expect(d.deliver).toHaveBeenCalledWith({
      eventId: "j1",
      type: "event.registration-cancelled",
      category: "ENGAGEMENT",
      recipientId: "user-1",
      payload: { eventId: "ev1" },
    });
    expect(d.findEmail).not.toHaveBeenCalled();
  });

  it("registration-cancelled skips a registrant who blocked the actor", async () => {
    const d = deps([], () => true);
    await createEventActivityProcessor("registration-cancelled", d)(
      { ...registration, actorId: "organizer-1" },
      ctx()
    );
    expect(d.deliver).not.toHaveBeenCalled();
  });
});
