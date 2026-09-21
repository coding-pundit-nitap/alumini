import { describe, expect, it } from "vitest";

import {
  canonicalPair,
  decideBlock,
  decideRemove,
  decideRequest,
  decideRespond,
  relationOf,
  REREQUEST_COOLDOWN_MS,
  statusFor,
  type ConnectionRow,
  type ConnectionState,
} from "./connection";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const now = new Date("2026-09-21T10:00:00Z");
const day = 24 * 60 * 60 * 1000;

const row = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
  id: "c1",
  userAId: A,
  userBId: B,
  requestedById: A,
  blockedById: null,
  state: "PENDING",
  requestedAt: new Date("2026-09-01T00:00:00Z"),
  respondedAt: null,
  ...over,
});
const rejected = (respondedAt: Date, over: Partial<ConnectionRow> = {}) =>
  row({ state: "REJECTED", respondedAt, ...over });
const blocked = (by: string) =>
  row({ state: "BLOCKED", blockedById: by, respondedAt: now });

describe("canonicalPair", () => {
  it("is symmetric and ordered a < b", () => {
    expect(canonicalPair(B, A)).toEqual({ userAId: A, userBId: B });
    expect(canonicalPair(A, B)).toEqual(canonicalPair(B, A));
  });
  it("lower-cases, so an upper-case id from a URL sorts like the database", () => {
    expect(canonicalPair(B.toUpperCase(), A)).toEqual({
      userAId: A,
      userBId: B,
    });
  });
});

describe("decideRequest", () => {
  it("creates when there is no row", () => {
    expect(decideRequest(null, A, now)).toEqual({ ok: true, action: "create" });
  });

  it.each(["PENDING", "ACCEPTED"] as ConnectionState[])(
    "refuses CONNECTION_EXISTS on a %s row, in either direction",
    (state) => {
      expect(decideRequest(row({ state }), A, now)).toMatchObject({
        code: "CONNECTION_EXISTS",
      });
      expect(decideRequest(row({ state }), B, now)).toMatchObject({
        code: "CONNECTION_EXISTS",
      });
    }
  );

  it("tells the blocker USER_BLOCKED and the blocked member NOT_FOUND", () => {
    expect(decideRequest(blocked(A), A, now)).toMatchObject({
      code: "USER_BLOCKED",
    });
    expect(decideRequest(blocked(A), B, now)).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  describe("after a rejection (A asked, B rejected)", () => {
    const at = new Date(now.getTime() - 10 * day);

    it("makes the rejected requester wait, and says until when", () => {
      const result = decideRequest(rejected(at), A, now);
      expect(result).toMatchObject({
        ok: false,
        code: "CONNECTION_COOLDOWN",
        eligibleAt: new Date(at.getTime() + REREQUEST_COOLDOWN_MS),
      });
    });

    it("lets the requester ask again once the cooldown has passed, reusing the row", () => {
      const old = new Date(now.getTime() - REREQUEST_COOLDOWN_MS - 1);
      expect(decideRequest(rejected(old), A, now)).toEqual({
        ok: true,
        action: "reopen",
        patch: {
          state: "PENDING",
          requestedById: A,
          requestedAt: now,
          respondedAt: null,
          blockedById: null,
        },
      });
    });

    it("does not make the member who rejected wait", () => {
      expect(decideRequest(rejected(at), B, now)).toMatchObject({
        ok: true,
        action: "reopen",
        patch: { requestedById: B, state: "PENDING" },
      });
    });

    it("allows the request exactly at the eligibility instant", () => {
      const exactly = new Date(now.getTime() - REREQUEST_COOLDOWN_MS);
      expect(decideRequest(rejected(exactly), A, now)).toMatchObject({
        ok: true,
      });
    });
  });
});

describe("decideRespond", () => {
  it("lets the recipient accept or reject a pending request", () => {
    expect(decideRespond(row(), B, "ACCEPTED", now)).toMatchObject({
      ok: true,
      patch: { state: "ACCEPTED", respondedAt: now, requestedById: A },
    });
    expect(decideRespond(row(), B, "REJECTED", now)).toMatchObject({
      ok: true,
      patch: { state: "REJECTED", respondedAt: now },
    });
  });

  it("refuses the requester their own request (NOT_CONNECTION_RECIPIENT)", () => {
    expect(decideRespond(row(), A, "ACCEPTED", now)).toMatchObject({
      code: "NOT_CONNECTION_RECIPIENT",
    });
  });

  it("hides the row from a non-party and from anyone on a blocked row", () => {
    expect(decideRespond(row(), C, "ACCEPTED", now)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(decideRespond(blocked(A), B, "ACCEPTED", now)).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(decideRespond(blocked(B), B, "ACCEPTED", now)).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it.each(["ACCEPTED", "REJECTED"] as ConnectionState[])(
    "refuses to respond twice to a %s request",
    (state) => {
      expect(
        decideRespond(row({ state, respondedAt: now }), B, "ACCEPTED", now)
      ).toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    }
  );
});

describe("decideRemove", () => {
  it("lets the requester cancel a pending request", () => {
    expect(decideRemove(row(), A)).toEqual({ ok: true, outcome: "cancelled" });
  });
  it("does not let the recipient delete an incoming request (they reject it)", () => {
    expect(decideRemove(row(), B)).toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });
  it("lets either party remove an accepted connection", () => {
    const accepted = row({ state: "ACCEPTED", respondedAt: now });
    expect(decideRemove(accepted, A)).toEqual({ ok: true, outcome: "removed" });
    expect(decideRemove(accepted, B)).toEqual({ ok: true, outcome: "removed" });
  });
  it("lets only the blocker lift a block; the blocked member sees nothing", () => {
    expect(decideRemove(blocked(A), A)).toEqual({
      ok: true,
      outcome: "unblocked",
    });
    expect(decideRemove(blocked(A), B)).toMatchObject({ code: "NOT_FOUND" });
  });
  it("never deletes a rejected row, so the cooldown cannot be erased", () => {
    expect(decideRemove(rejected(now), A)).toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
    expect(decideRemove(rejected(now), B)).toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });
  it("hides the row from a non-party", () => {
    expect(decideRemove(row(), C)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("decideBlock", () => {
  it("creates a blocked row with the blocker as the requester when none exists", () => {
    expect(decideBlock(null, B, now)).toEqual({
      ok: true,
      action: "create",
      patch: {
        state: "BLOCKED",
        requestedById: B,
        requestedAt: now,
        respondedAt: now,
        blockedById: B,
      },
    });
  });
  it.each(["PENDING", "ACCEPTED", "REJECTED"] as ConnectionState[])(
    "turns a %s row into a block, keeping who asked",
    (state) => {
      expect(
        decideBlock(row({ state, respondedAt: now }), B, now)
      ).toMatchObject({
        ok: true,
        action: "update",
        patch: { state: "BLOCKED", blockedById: B, requestedById: A },
      });
    }
  );
  it("is idempotent for the blocker and invisible to the blocked member", () => {
    expect(decideBlock(blocked(A), A, now)).toMatchObject({
      ok: true,
      action: "noop",
    });
    expect(decideBlock(blocked(A), B, now)).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("relationOf / statusFor", () => {
  it("maps rows to the relation the users module needs", () => {
    expect(relationOf(null)).toBe("none");
    expect(relationOf(row())).toBe("none");
    expect(relationOf(rejected(now))).toBe("none");
    expect(relationOf(row({ state: "ACCEPTED", respondedAt: now }))).toBe(
      "connected"
    );
    expect(relationOf(blocked(A))).toBe("blocked");
  });

  it("shows each member their own side, and never a rejection or someone else's block", () => {
    expect(statusFor(null, A)).toEqual({ state: "NONE" });
    expect(statusFor(row(), A)).toEqual({
      state: "OUTGOING",
      connectionId: "c1",
    });
    expect(statusFor(row(), B)).toEqual({
      state: "INCOMING",
      connectionId: "c1",
    });
    expect(statusFor(row({ state: "ACCEPTED", respondedAt: now }), B)).toEqual({
      state: "CONNECTED",
      connectionId: "c1",
    });
    expect(statusFor(rejected(now), A)).toEqual({ state: "NONE" });
    expect(statusFor(blocked(A), A)).toEqual({
      state: "BLOCKED_BY_ME",
      connectionId: "c1",
    });
    expect(statusFor(blocked(A), B)).toEqual({ state: "NONE" });
  });
});
