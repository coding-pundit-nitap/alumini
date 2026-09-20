import { describe, expect, it } from "vitest";

import { computeBackoffMs } from "./backoff.ts";
import { emailSend } from "./email.ts";

const policy = {
  attempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitter: 0.2,
};
const noJitter = () => 0.5; // 2 * 0.5 - 1 = 0

describe("computeBackoffMs", () => {
  it("doubles each attempt from the base delay", () => {
    expect(computeBackoffMs(policy, 1, noJitter)).toBe(1000);
    expect(computeBackoffMs(policy, 2, noJitter)).toBe(2000);
    expect(computeBackoffMs(policy, 3, noJitter)).toBe(4000);
  });

  it("caps at the maximum delay", () => {
    expect(computeBackoffMs(policy, 4, noJitter)).toBe(8000);
    expect(computeBackoffMs(policy, 10, noJitter)).toBe(8000);
  });

  it("applies jitter within ±jitter of the delay and never above the cap", () => {
    expect(computeBackoffMs(policy, 1, () => 0)).toBe(800);
    expect(computeBackoffMs(policy, 1, () => 1)).toBe(1200);
    expect(computeBackoffMs(policy, 4, () => 1)).toBe(8000);
  });

  it("is at least 1 ms", () => {
    expect(
      computeBackoffMs({ ...policy, baseDelayMs: 1, jitter: 0.9 }, 1, () => 0)
    ).toBeGreaterThanOrEqual(1);
  });

  it("gives email.send about six hours of retrying in total", () => {
    const retries = emailSend.retry.attempts - 1;
    let totalMs = 0;
    for (let attempt = 1; attempt <= retries; attempt++) {
      totalMs += computeBackoffMs(emailSend.retry, attempt, noJitter);
    }
    const hours = totalMs / 3_600_000;
    expect(hours).toBeGreaterThan(5.5);
    expect(hours).toBeLessThan(6.5);
  });
});
