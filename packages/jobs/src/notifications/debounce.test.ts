import { describe, expect, it } from "vitest";
import { debounceKeyFor, shouldFlush } from "./debounce.ts";

describe("message debounce", () => {
  it("builds a stable per-(recipient,conversation) key", () => {
    expect(debounceKeyFor("u1", "c1")).toBe("notif:debounce:u1:c1");
  });

  it("does not flush inside the window", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:03:00Z");
    expect(shouldFlush(start, now, 5 * 60_000)).toBe(false);
  });

  it("flushes once the window elapses", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-01T00:05:01Z");
    expect(shouldFlush(start, now, 5 * 60_000)).toBe(true);
  });
});
