import { describe, expect, it } from "vitest";

import { jobEvents } from "./job.ts";

describe("job event contracts", () => {
  it("defines all four actor-driven events, each validating its own payload", () => {
    expect(Object.keys(jobEvents)).toEqual([
      "job.submitted",
      "job.published",
      "job.rejected",
      "job.closed",
    ]);
    const base = {
      v: 1,
      jobId: "11111111-1111-4111-8111-111111111111",
      postedBy: "22222222-2222-4222-8222-222222222222",
      actorId: "22222222-2222-4222-8222-222222222222",
    };
    expect(jobEvents["job.submitted"].schema.safeParse(base).success).toBe(
      true
    );
    expect(
      jobEvents["job.published"].schema.safeParse({
        ...base,
        directPublish: false,
      }).success
    ).toBe(true);
    expect(jobEvents["job.published"].schema.safeParse(base).success).toBe(
      false
    ); // directPublish required
  });
});
