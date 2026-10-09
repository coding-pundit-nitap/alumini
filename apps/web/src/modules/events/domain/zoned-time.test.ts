import { describe, expect, it } from "vitest";

import { isValidTimeZone, zonedWallTimeToUtc } from "./zoned-time";

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Etc/UTC")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("zonedWallTimeToUtc", () => {
  it("converts a fixed +05:30 offset zone (Asia/Kolkata)", () => {
    // 10:00 IST = 04:30 UTC
    const result = zonedWallTimeToUtc("2026-06-15T10:00", "Asia/Kolkata");
    expect(result.toISOString()).toBe("2026-06-15T04:30:00.000Z");
  });

  it("converts Etc/UTC as a no-op", () => {
    const result = zonedWallTimeToUtc("2026-06-15T10:00", "Etc/UTC");
    expect(result.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("converts New York before the US DST spring-forward (EST, UTC-5)", () => {
    // 2026-03-07 is before the 2026 spring-forward (2026-03-08).
    const result = zonedWallTimeToUtc("2026-03-07T10:00", "America/New_York");
    expect(result.toISOString()).toBe("2026-03-07T15:00:00.000Z");
  });

  it("converts New York after the US DST spring-forward (EDT, UTC-4)", () => {
    // 2026-03-09 is after the 2026 spring-forward.
    const result = zonedWallTimeToUtc("2026-03-09T10:00", "America/New_York");
    expect(result.toISOString()).toBe("2026-03-09T14:00:00.000Z");
  });

  it("shifts a nonexistent spring-forward wall time forward by the gap", () => {
    // 2026-03-08 02:30 does not exist in America/New_York (clocks jump 2:00 -> 3:00).
    // Shifts forward by the gap: 03:30 EDT (UTC-4) = 07:30 UTC.
    const result = zonedWallTimeToUtc("2026-03-08T02:30", "America/New_York");
    expect(result.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves an ambiguous fall-back wall time to the earlier instant", () => {
    // 2026-11-01 01:30 occurs twice in America/New_York (EDT then EST).
    // Picks the earlier instant: EDT (UTC-4) -> 05:30 UTC, not EST's 06:30 UTC.
    const result = zonedWallTimeToUtc("2026-11-01T01:30", "America/New_York");
    expect(result.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("throws RangeError for a malformed wall string", () => {
    expect(() => zonedWallTimeToUtc("not-a-date", "Etc/UTC")).toThrow(
      RangeError
    );
    expect(() => zonedWallTimeToUtc("2026-06-15T10:00:00", "Etc/UTC")).toThrow(
      RangeError
    );
    expect(() => zonedWallTimeToUtc("2026-13-01T10:00", "Etc/UTC")).toThrow(
      RangeError
    );
  });

  it("throws RangeError for an invalid time zone", () => {
    expect(() => zonedWallTimeToUtc("2026-06-15T10:00", "Not/AZone")).toThrow(
      RangeError
    );
  });
});
