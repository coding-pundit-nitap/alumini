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
});
