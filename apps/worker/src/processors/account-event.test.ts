import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverNotification } from "../notifications/deliver.ts";
import {
  createAccountStateProcessor,
  createVerificationDecidedProcessor,
} from "./account-event.ts";

const ctx = (jobId = "j1") => ({
  jobId,
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});
const account = { v: 1 as const, userId: "user-1", actorId: "admin-1" };

describe("verification.decided processor (spec D12-1)", () => {
  it("delivers in-app only, transactional, with the decision", async () => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    await createVerificationDecidedProcessor({ deliver })(
      { v: 1, requestId: "req-1", userId: "user-1", decision: "REJECTED" },
      ctx()
    );
    expect(deliver).toHaveBeenCalledWith({
      eventId: "j1",
      type: "verification.decided",
      category: "TRANSACTIONAL",
      recipientId: "user-1",
      payload: { requestId: "req-1", decision: "REJECTED" },
    });
  });
});

describe("account state processor (spec D12-3)", () => {
  it.each([
    ["user.suspended", "SUSPENDED"],
    ["user.reactivated", "VERIFIED"],
  ] as const)("%s emails the address read in state %s", async (type, state) => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    const findEmail = vi.fn(async () => "u@nitap.ac.in" as string | null);
    await createAccountStateProcessor(type, { deliver, findEmail })(
      account,
      ctx()
    );
    expect(findEmail).toHaveBeenCalledWith("user-1", state);
    expect(deliver).toHaveBeenCalledWith({
      eventId: "j1",
      type,
      category: "TRANSACTIONAL",
      recipientId: "user-1",
      payload: {},
      emailTo: "u@nitap.ac.in",
    });
  });

  it("skips email when the account has left the announced state", async () => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    await createAccountStateProcessor("user.suspended", {
      deliver,
      findEmail: async () => null,
    })(account, ctx());
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0]![0].emailTo).toBeUndefined();
  });

  it("redelivery passes identical input", async () => {
    const deliver = vi.fn<DeliverNotification>(async () => {});
    const p = createAccountStateProcessor("user.reactivated", {
      deliver,
      findEmail: async () => "u@nitap.ac.in",
    });
    await p(account, ctx("same"));
    await p(account, ctx("same"));
    expect(deliver.mock.calls[1]).toEqual(deliver.mock.calls[0]);
  });
});
