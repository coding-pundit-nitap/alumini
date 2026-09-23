import { describe, expect, it } from "vitest";
import { decideChannel } from "./preference-decision";

describe("decideChannel", () => {
  it("transactional is always allowed regardless of preference", () => {
    expect(
      decideChannel({
        category: "TRANSACTIONAL",
        channel: "EMAIL",
        preferenceRow: { enabled: false },
      })
    ).toBe(true);
  });

  it("in-app is always allowed for engagement categories", () => {
    expect(
      decideChannel({
        category: "ENGAGEMENT",
        channel: "IN_APP",
        preferenceRow: { enabled: false },
      })
    ).toBe(true);
  });

  it("engagement email respects an explicit disabled preference", () => {
    expect(
      decideChannel({
        category: "ENGAGEMENT",
        channel: "EMAIL",
        preferenceRow: { enabled: false },
      })
    ).toBe(false);
  });

  it("engagement email defaults to enabled when no preference row exists", () => {
    expect(
      decideChannel({
        category: "ENGAGEMENT",
        channel: "EMAIL",
        preferenceRow: null,
      })
    ).toBe(true);
  });
});
