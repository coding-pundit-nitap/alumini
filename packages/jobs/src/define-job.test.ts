import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineJob } from "./define-job.ts";

const valid = {
  name: "thing.do",
  version: 1,
  queue: "default" as const,
  schema: z.object({ v: z.literal(1) }),
  retry: { attempts: 3, baseDelayMs: 1000, maxDelayMs: 10_000, jitter: 0.2 },
  timeoutMs: 5000,
  idempotency: "the row id; running twice updates the same row",
};

describe("defineJob", () => {
  it("returns a frozen definition", () => {
    const job = defineJob(valid);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.retry)).toBe(true);
  });

  it.each([
    ["a name that is not dot-separated lower-case", { name: "Thing" }],
    ["a version below 1", { version: 0 }],
    ["zero attempts", { retry: { ...valid.retry, attempts: 0 } }],
    [
      "a max delay below the base delay",
      { retry: { ...valid.retry, maxDelayMs: 10 } },
    ],
    ["jitter of 1 or more", { retry: { ...valid.retry, jitter: 1 } }],
    ["a non-positive timeout", { timeoutMs: 0 }],
    ["no stated idempotency rule", { idempotency: "" }],
  ])("rejects %s", (_label, override) => {
    expect(() => defineJob({ ...valid, ...override })).toThrow();
  });
});
