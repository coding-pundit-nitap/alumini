import { describe, expect, it } from "vitest";

import { decideClaim, decideResolve, reportContentInput } from "./moderation";

const MOD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTHOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("reportContentInput", () => {
  it("accepts POST/COMMENT targets and a 1..1000 char reason", () => {
    expect(
      reportContentInput.safeParse({
        targetType: "POST",
        targetId: "x",
        reason: "spam",
      }).success
    ).toBe(true);
    expect(
      reportContentInput.safeParse({
        targetType: "MESSAGE",
        targetId: "x",
        reason: "spam",
      }).success
    ).toBe(false);
    expect(
      reportContentInput.safeParse({
        targetType: "POST",
        targetId: "x",
        reason: "",
      }).success
    ).toBe(false);
  });
});

describe("decideClaim (OPEN -> UNDER_REVIEW, courtesy step, C-8)", () => {
  it("any moderator may claim an OPEN report that isn't theirs to report/own", () => {
    expect(decideClaim("OPEN", MOD, REPORTER, AUTHOR)).toEqual({ ok: true });
  });
  it("refuses outside OPEN", () => {
    for (const status of ["UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const) {
      expect(decideClaim(status, MOD, REPORTER, AUTHOR)).toEqual({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  });
  it("refuses the reporter or the content author claiming their own report", () => {
    expect(decideClaim("OPEN", REPORTER, REPORTER, AUTHOR)).toEqual({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
    expect(decideClaim("OPEN", AUTHOR, REPORTER, AUTHOR)).toEqual({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
  });
});

describe("decideResolve (OPEN|UNDER_REVIEW -> RESOLVED|DISMISSED, C-8)", () => {
  it("claim-first is not enforced: OPEN resolves/dismisses directly", () => {
    expect(decideResolve("OPEN", MOD, REPORTER, AUTHOR, "resolve")).toEqual({
      ok: true,
      to: "RESOLVED",
    });
    expect(decideResolve("OPEN", MOD, REPORTER, AUTHOR, "dismiss")).toEqual({
      ok: true,
      to: "DISMISSED",
    });
    expect(
      decideResolve("UNDER_REVIEW", MOD, REPORTER, AUTHOR, "resolve")
    ).toEqual({
      ok: true,
      to: "RESOLVED",
    });
  });
  it("refuses a report already RESOLVED or DISMISSED", () => {
    for (const status of ["RESOLVED", "DISMISSED"] as const) {
      expect(decideResolve(status, MOD, REPORTER, AUTHOR, "resolve")).toEqual({
        ok: false,
        code: "INVALID_STATE_TRANSITION",
      });
    }
  });
  it("refuses the reporter or the content author resolving their own report", () => {
    expect(
      decideResolve("OPEN", REPORTER, REPORTER, AUTHOR, "resolve")
    ).toEqual({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
    expect(decideResolve("OPEN", AUTHOR, REPORTER, AUTHOR, "dismiss")).toEqual({
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
    });
  });
});
