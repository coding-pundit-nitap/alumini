import { describe, expect, it } from "vitest";

import type { AccountState, Actor } from "./actor";
import { decide } from "./decide";
import {
  isPermission,
  PERMISSIONS,
  SELF_SERVICE_PERMISSIONS,
} from "./permission";

const NOW = new Date("2026-09-21T10:00:00Z");
const actor = (
  accountState: AccountState,
  grants: Actor["grants"] = []
): Actor => ({
  userId: "u1",
  accountState,
  requestId: "r1",
  grants,
});
const VERIFICATION_REQUEST = SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST;

describe("verification.request (a self-service permission)", () => {
  it.each(["PENDING", "REJECTED"] as const)(
    "is allowed to a %s account",
    (state) => {
      expect(
        decide({
          actor: actor(state),
          permission: VERIFICATION_REQUEST,
          now: NOW,
        })
      ).toEqual({ allow: true });
    }
  );

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "is denied to a %s account by the state gate",
    (state) => {
      expect(
        decide({
          actor: actor(state),
          permission: VERIFICATION_REQUEST,
          now: NOW,
        })
      ).toEqual({ allow: false, reason: "ACCOUNT_STATE" });
    }
  );

  it("is not held by a VERIFIED account: there is no grant for it", () => {
    expect(
      decide({
        actor: actor("VERIFIED"),
        permission: VERIFICATION_REQUEST,
        now: NOW,
      })
    ).toEqual({ allow: false, reason: "NO_GRANT" });
  });

  it("is not a grantable permission: the database registry does not know it", () => {
    expect(Object.values(PERMISSIONS)).not.toContain(VERIFICATION_REQUEST);
    expect(isPermission(VERIFICATION_REQUEST)).toBe(false);
  });
});

describe("the state allowance never widens into grantable permissions", () => {
  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"] as const)(
    "a %s account is denied alumni.verify even with a forged grant",
    (state) => {
      const forged = actor(state, [
        {
          permission: PERMISSIONS.ALUMNI_VERIFY,
          scope: "GLOBAL",
          expiresAt: null,
        },
      ]);
      expect(
        decide({
          actor: forged,
          permission: PERMISSIONS.ALUMNI_VERIFY,
          now: NOW,
        })
      ).toEqual({ allow: false, reason: "ACCOUNT_STATE" });
    }
  );

  it("every grantable permission is denied to every non-VERIFIED state, except profile.update for PENDING and REJECTED", () => {
    for (const state of [
      "PENDING",
      "REJECTED",
      "SUSPENDED",
      "DEACTIVATED",
    ] as const) {
      for (const permission of Object.values(PERMISSIONS)) {
        const allowedByState =
          permission === PERMISSIONS.PROFILE_UPDATE &&
          (state === "PENDING" || state === "REJECTED");
        expect(decide({ actor: actor(state), permission, now: NOW })).toEqual(
          allowedByState
            ? { allow: true }
            : { allow: false, reason: "ACCOUNT_STATE" }
        );
      }
    }
  });
});

describe("profile.update (allowed by state for accounts that cannot hold grants yet, RBAC §7)", () => {
  it.each(["PENDING", "REJECTED"] as const)(
    "is allowed to a %s account",
    (state) => {
      expect(
        decide({
          actor: actor(state),
          permission: PERMISSIONS.PROFILE_UPDATE,
          now: NOW,
        })
      ).toEqual({ allow: true });
    }
  );

  it.each(["SUSPENDED", "DEACTIVATED"] as const)(
    "is denied to a %s account",
    (state) => {
      expect(
        decide({
          actor: actor(state),
          permission: PERMISSIONS.PROFILE_UPDATE,
          now: NOW,
        })
      ).toEqual({ allow: false, reason: "ACCOUNT_STATE" });
    }
  );

  it("does not extend to reading any profile or to institutional changes", () => {
    for (const permission of [
      PERMISSIONS.PROFILE_READ,
      PERMISSIONS.PROFILE_READ_ANY,
      PERMISSIONS.PROFILE_UPDATE_INSTITUTIONAL,
    ]) {
      expect(decide({ actor: actor("PENDING"), permission, now: NOW })).toEqual(
        { allow: false, reason: "ACCOUNT_STATE" }
      );
    }
  });
});
