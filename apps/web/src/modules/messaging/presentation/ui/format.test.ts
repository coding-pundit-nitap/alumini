import { describe, expect, it } from "vitest";

import { dayKey, dayLabel, inboxStamp } from "./format";

const now = new Date(2026, 8, 25, 15, 0);
const at = (daysBack: number, hour = 9) =>
  new Date(2026, 8, 25 - daysBack, hour, 30);

describe("message time labels", () => {
  it("names days relative to now, by local calendar day", () => {
    expect(dayLabel(at(0, 0), now)).toBe("Today");
    expect(dayLabel(at(1, 23), now)).toBe("Yesterday");
    expect(dayLabel(at(3), now)).toBe(
      at(3).toLocaleDateString("en-IN", { weekday: "long" })
    );
    expect(dayLabel(at(10), now)).toMatch(/2026/);
  });

  it("stamps the inbox with a time today and a date later", () => {
    expect(inboxStamp(at(0), now)).toMatch(/9:30/);
    expect(inboxStamp(at(1), now)).toBe("Yesterday");
    expect(inboxStamp(new Date(2025, 0, 2), now)).toMatch(/25$/);
  });

  it("keys messages on the same local day together", () => {
    expect(dayKey(at(0, 0))).toBe(dayKey(at(0, 23)));
    expect(dayKey(at(0))).not.toBe(dayKey(at(1)));
  });
});
