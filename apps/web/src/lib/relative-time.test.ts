import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const now = new Date("2026-09-24T12:00:00Z");

function before(ms: number) {
  return new Date(now.getTime() - ms);
}

describe("relativeTime", () => {
  it("shows 'just now' under a minute", () => {
    expect(relativeTime(before(30_000), now)).toBe("just now");
  });

  it("shows minutes", () => {
    expect(relativeTime(before(5 * 60_000), now)).toBe("5m");
  });

  it("shows hours", () => {
    expect(relativeTime(before(3 * 60 * 60_000), now)).toBe("3h");
  });

  it("shows days under a week", () => {
    expect(relativeTime(before(2 * 24 * 60 * 60_000), now)).toBe("2d");
  });

  it("shows day and month for the same year at a week or more", () => {
    expect(relativeTime(before(10 * 24 * 60 * 60_000), now)).toBe("14 Sep");
  });

  it("shows day, month and year for a different year", () => {
    expect(relativeTime(before(400 * 24 * 60 * 60_000), now)).toBe(
      "20 Aug 2025"
    );
  });

  it("treats a future date (clock skew) as 'just now'", () => {
    expect(relativeTime(new Date(now.getTime() + 60_000), now)).toBe(
      "just now"
    );
  });
});
