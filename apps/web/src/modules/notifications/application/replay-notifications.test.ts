import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { createReplayNotifications } from "./replay-notifications";

const NOTIFICATION = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "admin-1" } as Actor;

function setup(audit: () => Promise<void>) {
  const onAuditFailed = vi.fn();
  const retry = vi.fn(async () => 1);
  const replay = createReplayNotifications({
    authorize: (a) => a as Actor,
    queueAdmin: () => ({ retry }),
    failedEmailJobId: async () => "dedupe-key",
    audit,
    onAuditFailed,
  });
  return { replay, retry, onAuditFailed };
}

describe("replayNotifications audit failure (spec 13B B-8)", () => {
  it("reports an audit write that fails after the retry, and still answers with the count", async () => {
    const failure = new Error("audit insert failed");
    const { replay, retry, onAuditFailed } = setup(async () => {
      throw failure;
    });

    await expect(
      replay.replay({ actor, notificationId: NOTIFICATION })
    ).resolves.toEqual({ retried: 1 });

    expect(retry).toHaveBeenCalledWith("email", ["dedupe-key"]);
    expect(onAuditFailed).toHaveBeenCalledWith(failure, {
      notificationId: NOTIFICATION,
      actorId: "admin-1",
      retried: 1,
    });
  });

  it("does not report anything when the audit write succeeds", async () => {
    const { replay, onAuditFailed } = setup(async () => {});

    await replay.replay({ actor, notificationId: NOTIFICATION });

    expect(onAuditFailed).not.toHaveBeenCalled();
  });
});
