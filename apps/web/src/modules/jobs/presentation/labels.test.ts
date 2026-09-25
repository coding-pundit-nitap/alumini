import { describe, expect, it } from "vitest";

import { deadlineLabel } from "./labels";

const now = new Date("2026-09-25T18:30:00Z");

describe("deadlineLabel", () => {
  it("counts whole UTC days to the deadline", () => {
    expect(deadlineLabel(new Date("2026-09-25"), now)).toEqual({
      text: "Closes today",
      soon: true,
    });
    expect(deadlineLabel(new Date("2026-09-26"), now).text).toBe(
      "Closes tomorrow"
    );
    expect(deadlineLabel(new Date("2026-09-28"), now)).toEqual({
      text: "Closes in 3 days",
      soon: true,
    });
    expect(deadlineLabel(new Date("2026-10-02"), now)).toEqual({
      text: "Closes in 7 days",
      soon: false,
    });
  });

  it("shows the date further out, with the year only when it differs", () => {
    expect(deadlineLabel(new Date("2026-12-01"), now).text).toBe(
      "Apply by 1 Dec"
    );
    expect(deadlineLabel(new Date("2027-09-30"), now).text).toBe(
      "Apply by 30 Sep 2027"
    );
  });
});
