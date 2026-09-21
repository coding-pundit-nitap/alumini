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

  it("idempotency.sweep is a scheduled job, not an outbox event", () => {
    expect(JOBS["idempotency.sweep"].queue).toBe("scheduled");
    expect(isOutboxEventType("idempotency.sweep")).toBe(false);
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

  it("every mentorship.* event is an outbox event, keyed by its own name, on the default queue", () => {
    const mentorshipTypes = [
      "mentorship.requested",
      "mentorship.accepted",
      "mentorship.declined",
      "mentorship.cancelled",
      "mentorship.started",
      "mentorship.completed",
    ] as const;
    for (const type of mentorshipTypes) {
      expect(isOutboxEventType(type)).toBe(true);
      expect(OUTBOX_EVENTS[type].name).toBe(type);
      expect(OUTBOX_EVENTS[type].queue).toBe("default");
    }
  });

  it("mentorship.* payload is ids-only: an extra key or a non-uuid id fails schema.safeParse", () => {
    const payload = {
      v: 1,
      mentorshipId: crypto.randomUUID(),
      mentorId: crypto.randomUUID(),
      menteeId: crypto.randomUUID(),
      actorId: crypto.randomUUID(),
    };
    const schema = OUTBOX_EVENTS["mentorship.requested"].schema;
    expect(schema.safeParse(payload).success).toBe(true);
    expect(schema.safeParse({ ...payload, message: "hi" }).success).toBe(false);
    expect(
      schema.safeParse({ ...payload, mentorshipId: "not-a-uuid" }).success
    ).toBe(false);
  });
});
