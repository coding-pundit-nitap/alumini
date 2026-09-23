import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import { createMentorshipEventProcessor } from "./mentorship-event.ts";

const payload = (actorId: string) => ({
  v: 1 as const,
  mentorshipId: "m1",
  mentorId: "mentor-1",
  menteeId: "mentee-1",
  actorId,
});

const ctx = () => ({
  jobId: "e1",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});

const deps = (isBlocked = false) => ({
  deliver: vi.fn<DeliverNotification>(async () => {}),
  findEmail: vi.fn(async () => "e@nitap.ac.in" as string | null),
  blocked: vi.fn(async () => isBlocked),
});

const recipients = (d: ReturnType<typeof deps>) =>
  d.deliver.mock.calls.map((c) => c[0].recipientId).sort();

describe("mentorship event processor", () => {
  it.each([
    ["requested", "mentee-1", ["mentor-1"]],
    ["accepted", "mentor-1", ["mentee-1"]],
    ["declined", "mentor-1", ["mentee-1"]],
    ["started", "mentor-1", ["mentee-1"]],
    ["completed", "mentor-1", ["mentee-1", "mentor-1"]],
    ["cancelled", "mentee-1", ["mentor-1"]],
    ["cancelled", "mentor-1", ["mentee-1"]],
  ])("%s by %s notifies %j", async (action, actor, expected) => {
    const d = deps();
    await createMentorshipEventProcessor(action, d)(payload(actor), ctx());
    expect(recipients(d)).toEqual(expected);
  });

  it.each([
    ["requested", true],
    ["accepted", true],
    ["declined", false],
    ["cancelled", false],
    ["started", false],
    ["completed", false],
  ])("%s email=%s", async (action, emailed) => {
    const d = deps();
    await createMentorshipEventProcessor(action, d)(payload("mentor-1"), ctx());
    for (const [input] of d.deliver.mock.calls)
      expect(input.emailTo).toBe(emailed ? "e@nitap.ac.in" : undefined);
  });

  it("skips a recipient blocked with the actor", async () => {
    const d = deps(true);
    await createMentorshipEventProcessor("requested", d)(
      payload("mentee-1"),
      ctx()
    );
    expect(d.deliver).not.toHaveBeenCalled();
  });
});
