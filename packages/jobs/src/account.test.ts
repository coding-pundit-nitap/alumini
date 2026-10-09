import { describe, expect, it } from "vitest";

import {
  userReactivated,
  userSuspended,
  verificationDecided,
} from "./account.ts";
import { OUTBOX_EVENTS, isOutboxEventType } from "./registry.ts";

const id = () => crypto.randomUUID();

describe("account outbox contracts", () => {
  it("registers all three as outbox events on the default queue", () => {
    for (const job of [verificationDecided, userSuspended, userReactivated]) {
      expect(isOutboxEventType(job.name)).toBe(true);
      expect(OUTBOX_EVENTS[job.name]).toBe(job);
      expect(job.queue).toBe("default");
    }
  });

  it("verification.decided carries the request, the subject and the decision", () => {
    const payload = {
      v: 1,
      requestId: id(),
      userId: id(),
      decision: "APPROVED",
    };
    const { schema } = verificationDecided;
    expect(schema.safeParse(payload).success).toBe(true);
    expect(schema.safeParse({ ...payload, decision: "REJECTED" }).success).toBe(
      true
    );
    expect(schema.safeParse({ ...payload, decision: "PENDING" }).success).toBe(
      false
    );
    expect(schema.safeParse({ ...payload, note: "x" }).success).toBe(false);
  });

  it("user.suspended / user.reactivated carry ids only", () => {
    const payload = { v: 1, userId: id(), actorId: id() };
    for (const { schema } of [userSuspended, userReactivated]) {
      expect(schema.safeParse(payload).success).toBe(true);
      expect(schema.safeParse({ ...payload, reason: "SPAM" }).success).toBe(
        false
      );
      expect(schema.safeParse({ ...payload, userId: "nope" }).success).toBe(
        false
      );
    }
  });
});
