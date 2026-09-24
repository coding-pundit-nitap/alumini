import { describe, expect, it } from "vitest";

import { duration, hostPath, monogram, monthYear } from "./format";

describe("profile formatting", () => {
  it("formats month and year, passing through what it can't parse", () => {
    expect(monthYear("2020-01-15")).toBe("Jan 2020");
    expect(monthYear("soon")).toBe("soon");
  });

  it("counts a role's length inclusively, to now when it is current", () => {
    expect(duration("2020-01-15", "2020-01-20")).toBe("1 mo");
    expect(duration("2020-01-01", "2021-03-01")).toBe("1 yr 3 mos");
    expect(duration("2019-06-01", "2021-05-31")).toBe("2 yrs");
    expect(duration("2025-10-01", null, new Date(2026, 8, 25))).toBe("1 yr");
    expect(duration("2021-05-01", "2020-01-01")).toBe("");
  });

  it("shows a link as host and path", () => {
    expect(hostPath("https://www.github.com/asha/")).toBe("github.com/asha");
    expect(hostPath("https://example.test")).toBe("example.test");
    expect(hostPath("not a url")).toBe("not a url");
  });

  it("makes a monogram from the first two words", () => {
    expect(monogram("IIT Madras")).toBe("IM");
    expect(monogram("Acme")).toBe("A");
    expect(monogram("Tata Consultancy Services")).toBe("TC");
  });
});
