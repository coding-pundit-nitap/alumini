import { describe, expect, it } from "vitest";

import { ACCOUNT_STATES, type Actor, type Grant, type Resource } from "./actor";
import { decide } from "./decide";
import { PERMISSIONS, type Permission } from "./permission";

const NOW = new Date("2026-09-21T00:00:00.000Z");
const CHAPTER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAPTER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ME = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: ME,
  accountState: "VERIFIED",
  requestId: "req-1",
  grants: [],
  ...overrides,
});
const globalGrant = (
  permission: Permission,
  expiresAt: Date | null = null
): Grant => ({ permission, scope: "GLOBAL", expiresAt });
const chapterGrant = (
  permission: Permission,
  chapterId: string,
  expiresAt: Date | null = null
): Grant => ({ permission, scope: "CHAPTER", chapterId, expiresAt });
const check = (a: Actor, permission: Permission, resource?: Resource) =>
  decide({ actor: a, permission, resource, now: NOW });

describe("decide: account-state gate (RBAC §7)", () => {
  it("allows a VERIFIED actor holding a global grant", () => {
    const a = actor({ grants: [globalGrant(PERMISSIONS.EVENT_CREATE)] });
    expect(check(a, PERMISSIONS.EVENT_CREATE)).toEqual({ allow: true });
  });

  const blocked = ACCOUNT_STATES.filter((state) => state !== "VERIFIED");

  it.each(blocked)(
    "denies every permission to a %s actor even when a grant exists",
    (accountState) => {
      const grants = Object.values(PERMISSIONS).map((p) => globalGrant(p));
      const a = actor({ accountState, grants });
      for (const permission of Object.values(PERMISSIONS)) {
        expect(check(a, permission), permission).toEqual({
          allow: false,
          reason: "ACCOUNT_STATE",
        });
      }
    }
  );
});

describe("decide: grant match (RBAC §5)", () => {
  it("denies NO_GRANT when the actor holds nothing", () => {
    expect(check(actor(), PERMISSIONS.EVENT_CREATE)).toEqual({
      allow: false,
      reason: "NO_GRANT",
    });
  });

  it("does not let a grant for one permission satisfy another", () => {
    const a = actor({ grants: [globalGrant(PERMISSIONS.EVENT_READ)] });
    expect(check(a, PERMISSIONS.EVENT_CREATE)).toEqual({
      allow: false,
      reason: "NO_GRANT",
    });
  });

  it("lets a GLOBAL grant act on any resource, with or without a chapter", () => {
    const a = actor({ grants: [globalGrant(PERMISSIONS.POST_MODERATE)] });
    expect(check(a, PERMISSIONS.POST_MODERATE)).toEqual({ allow: true });
    expect(
      check(a, PERMISSIONS.POST_MODERATE, { chapterId: CHAPTER_A })
    ).toEqual({ allow: true });
    expect(check(a, PERMISSIONS.POST_MODERATE, { chapterId: null })).toEqual({
      allow: true,
    });
  });

  it("lets a CHAPTER grant act inside its own chapter", () => {
    const a = actor({
      grants: [chapterGrant(PERMISSIONS.EVENT_MANAGE, CHAPTER_A)],
    });
    expect(
      check(a, PERMISSIONS.EVENT_MANAGE, { chapterId: CHAPTER_A })
    ).toEqual({ allow: true });
  });

  it("denies SCOPE_MISMATCH for a CHAPTER grant on another chapter", () => {
    const a = actor({
      grants: [chapterGrant(PERMISSIONS.EVENT_MANAGE, CHAPTER_A)],
    });
    expect(
      check(a, PERMISSIONS.EVENT_MANAGE, { chapterId: CHAPTER_B })
    ).toEqual({ allow: false, reason: "SCOPE_MISMATCH" });
  });

  it.each([[undefined], [null]])(
    "denies a CHAPTER grant on a resource with no chapter (chapterId %s)",
    (chapterId) => {
      const a = actor({
        grants: [chapterGrant(PERMISSIONS.POST_MODERATE, CHAPTER_A)],
      });
      expect(check(a, PERMISSIONS.POST_MODERATE, { chapterId })).toEqual({
        allow: false,
        reason: "SCOPE_MISMATCH",
      });
    }
  );

  it("treats a grant expiring exactly now as expired", () => {
    const a = actor({
      grants: [globalGrant(PERMISSIONS.EVENT_CREATE, NOW)],
    });
    expect(check(a, PERMISSIONS.EVENT_CREATE)).toEqual({
      allow: false,
      reason: "NO_GRANT",
    });
  });

  it("honours a grant that expires in the future", () => {
    const later = new Date(NOW.getTime() + 60_000);
    const a = actor({
      grants: [globalGrant(PERMISSIONS.EVENT_CREATE, later)],
    });
    expect(check(a, PERMISSIONS.EVENT_CREATE)).toEqual({ allow: true });
  });
});

describe("decide: guardrails (RBAC §8.3 separation of duties)", () => {
  const verifier = () =>
    actor({ grants: [globalGrant(PERMISSIONS.ALUMNI_VERIFY)] });

  it("denies SELF_DECISION when deciding one's own verification", () => {
    expect(
      check(verifier(), PERMISSIONS.ALUMNI_VERIFY, { subjectUserId: ME })
    ).toEqual({ allow: false, reason: "SELF_DECISION" });
  });

  it("allows deciding someone else's verification", () => {
    expect(
      check(verifier(), PERMISSIONS.ALUMNI_VERIFY, { subjectUserId: OTHER })
    ).toEqual({ allow: true });
  });

  it("does not apply the rule to other permissions", () => {
    const a = actor({ grants: [globalGrant(PERMISSIONS.PROFILE_READ_ANY)] });
    expect(
      check(a, PERMISSIONS.PROFILE_READ_ANY, { subjectUserId: ME })
    ).toEqual({ allow: true });
  });

  it("reports the missing grant before the guardrail", () => {
    expect(
      check(actor(), PERMISSIONS.ALUMNI_VERIFY, { subjectUserId: ME })
    ).toEqual({ allow: false, reason: "NO_GRANT" });
  });

  it("reports the account state before anything else", () => {
    const a = actor({
      accountState: "SUSPENDED",
      grants: [globalGrant(PERMISSIONS.ALUMNI_VERIFY)],
    });
    expect(check(a, PERMISSIONS.ALUMNI_VERIFY, { subjectUserId: ME })).toEqual({
      allow: false,
      reason: "ACCOUNT_STATE",
    });
  });
});
