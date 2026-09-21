import { describe, expect, it } from "vitest";

import { JOBS, OUTBOX_EVENTS, isOutboxEventType } from "./registry.ts";

describe("registry", () => {
  it("every outbox event is also a job, keyed by its own name", () => {
    for (const [type, job] of Object.entries(OUTBOX_EVENTS)) {
      expect(job.name).toBe(type);
      expect(JOBS[type as keyof typeof JOBS]).toBe(job);
    }
  });

  it("outbox.prune is a scheduled job, not an outbox event", () => {
    expect(JOBS["outbox.prune"].queue).toBe("scheduled");
    expect(isOutboxEventType("outbox.prune")).toBe(false);
    expect(isOutboxEventType("email.send")).toBe(true);
    expect(isOutboxEventType("nope")).toBe(false);
  });

  it("upload.scan is an outbox event (the web app writes it); upload.sweep is scheduled only", () => {
    expect(isOutboxEventType("upload.scan")).toBe(true);
    expect(JOBS["upload.sweep"].queue).toBe("scheduled");
    expect(isOutboxEventType("upload.sweep")).toBe(false);
  });

  it("connection.requested and connection.accepted are outbox events with an ids-only payload", () => {
    const payload = {
      v: 1,
      connectionId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
      recipientId: crypto.randomUUID(),
    };
    for (const type of [
      "connection.requested",
      "connection.accepted",
    ] as const) {
      expect(isOutboxEventType(type)).toBe(true);
      expect(OUTBOX_EVENTS[type].schema.safeParse(payload).success).toBe(true);
      expect(
        OUTBOX_EVENTS[type].schema.safeParse({ ...payload, name: "Asha" })
          .success
      ).toBe(false);
    }
  });
});
