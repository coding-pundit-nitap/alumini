import { describe, expect, it } from "vitest";

import { jobExpire, jobExpired } from "./job-expire.ts";
import { JOBS, OUTBOX_EVENTS } from "./registry.ts";

describe("job.expire (scheduled) and job.expired (outbox event)", () => {
  it("job.expire is registered in JOBS but not OUTBOX_EVENTS (worker-only, spec J-7)", () => {
    expect(JOBS["job.expire"]).toBe(jobExpire);
    expect("job.expire" in OUTBOX_EVENTS).toBe(false);
    expect(jobExpire.queue).toBe("scheduled");
  });

  it("job.expired is registered in OUTBOX_EVENTS and validates ids-only, no actorId", () => {
    expect(OUTBOX_EVENTS["job.expired"]).toBe(jobExpired);
    expect(
      jobExpired.schema.safeParse({
        v: 1,
        jobId: "11111111-1111-4111-8111-111111111111",
        postedBy: "22222222-2222-4222-8222-222222222222",
      }).success
    ).toBe(true);
  });
});
