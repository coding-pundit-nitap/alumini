import { describe, expect, it } from "vitest";

import { dateBlock, formatEventTime, spotsLabel } from "./format";

describe("formatEventTime", () => {
  const instant = new Date("2026-10-01T12:30:00Z");

  it("formats the instant in the event's own zone, with the zone name", () => {
    expect(formatEventTime(instant, "Asia/Kolkata")).toBe(
      "Thu, Oct 1, 2026, 6:00 PM GMT+5:30"
    );
    expect(formatEventTime(instant, "America/New_York")).toBe(
      "Thu, Oct 1, 2026, 8:30 AM EDT"
    );
  });

  it("does not depend on the server's zone", () => {
    expect(formatEventTime(instant, "UTC")).toBe(
      "Thu, Oct 1, 2026, 12:30 PM UTC"
    );
  });
});

describe("spotsLabel", () => {
  it.each([
    [0, 100, "0 of 100 spots left"],
    [1, 100, "1 of 100 spots left"],
    [42, 100, "42 of 100 spots left"],
  ])("%i of %i", (remaining, capacity, label) => {
    expect(spotsLabel(remaining, capacity)).toBe(label);
  });
});

describe("dateBlock", () => {
  it("reads the month and day in the event's zone, not UTC", () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in Kolkata.
    const instant = new Date("2026-09-30T20:00:00Z");
    expect(dateBlock(instant, "Asia/Kolkata")).toEqual({
      month: "Oct",
      day: "1",
    });
    expect(dateBlock(instant, "UTC")).toEqual({ month: "Sep", day: "30" });
  });
});
