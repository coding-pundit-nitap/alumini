import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { fakeAccessStore } from "../../../../tests/support/fake-access-store";
import { createGrantPermission } from "./grant-permission";

const A = "00000000-0000-4000-8000-0000000000aa";
const T = "00000000-0000-4000-8000-0000000000bb";
const CH = "00000000-0000-4000-8000-0000000000cc";
const CH_ARCHIVED = "00000000-0000-4000-8000-0000000000dd";
const CH_UNKNOWN = "00000000-0000-4000-8000-0000000000ee";
const now = new Date("2026-09-24T12:00:00Z");

// Coordinator: permission.grant + event.manage, both GLOBAL (rbac-permission-matrix.md §2).
const coordinator = () =>
  ({
    userId: A,
    accountState: "VERIFIED",
    requestId: "r",
    grants: [
      {
        permission: "permission.grant",
        scope: "GLOBAL" as const,
        expiresAt: null,
      },
      { permission: "event.manage", scope: "GLOBAL" as const, expiresAt: null },
    ],
  }) as Actor;

function setup(opts: { targetExists?: boolean } = {}) {
  const fake = fakeAccessStore({
    users:
      opts.targetExists === false
        ? []
        : [{ id: T, accountState: "VERIFIED", roles: [] }],
    chapters: [
      { id: CH, archived: false },
      { id: CH_ARCHIVED, archived: true },
    ],
  });
  const authorize = vi.fn((a: Actor | null) => a as Actor);
  const loadGrants = vi.fn(async () => []);
  const grant = createGrantPermission({
    store: fake.store,
    authorize,
    loadGrants,
    now: () => now,
  });
  return { ...fake, authorize, loadGrants, grant };
}

describe("grantPermission (spec B12-3, B12-4)", () => {
  it("grants a chapter-scoped permission the coordinator holds globally", async () => {
    const s = setup();
    const result = await s.grant({
      actor: coordinator(),
      userId: T,
      input: { permission: "event.manage", scope: "CHAPTER", chapterId: CH },
    });
    expect(result).toMatchObject({
      permission: "event.manage",
      scope: "CHAPTER",
      chapterId: CH,
    });
    expect(s.audits[0]).toEqual({
      action: "permission.granted",
      actorId: A,
      targetUserId: T,
      metadata: {
        grantId: result.id,
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: CH,
        expiresAt: null,
      },
    });
  });

  it("403s a GLOBAL grant from a non-role-manager (CHAPTER_ONLY)", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: { permission: "event.manage", scope: "GLOBAL" },
      })
    ).rejects.toMatchObject({
      code: "ACCESS_ESCALATION_FORBIDDEN",
      message:
        "You can only grant chapter-scoped permissions from the chapter bundle.",
    });
    expect(s.calls).toEqual([]);
  });

  it("403s a permission the actor does not hold (NOT_HELD)", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: { permission: "post.moderate", scope: "CHAPTER", chapterId: CH },
      })
    ).rejects.toMatchObject({
      code: "ACCESS_ESCALATION_FORBIDDEN",
      message: "You can only grant a permission you hold, in a scope you hold.",
    });
    expect(s.calls).toEqual([]);
  });

  it("400s an archived chapter with field 'chapterId'", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: {
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH_ARCHIVED,
        },
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ field: "chapterId" }],
    });
  });

  it("400s an unknown chapter with field 'chapterId'", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: {
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH_UNKNOWN,
        },
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ field: "chapterId" }],
    });
  });

  it("400s expiresAt equal to now with field 'expiresAt'", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: {
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH,
          expiresAt: now.toISOString(),
        },
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ field: "expiresAt" }],
    });
  });

  it("400s expiresAt in the past with field 'expiresAt'", async () => {
    const s = setup();
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: {
          permission: "event.manage",
          scope: "CHAPTER",
          chapterId: CH,
          expiresAt: new Date(now.getTime() - 1000).toISOString(),
        },
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ field: "expiresAt" }],
    });
  });

  it("stores and audits a future expiresAt as an ISO string", async () => {
    const s = setup();
    const future = new Date(now.getTime() + 60_000);
    const result = await s.grant({
      actor: coordinator(),
      userId: T,
      input: {
        permission: "event.manage",
        scope: "CHAPTER",
        chapterId: CH,
        expiresAt: future.toISOString(),
      },
    });
    expect(result.expiresAt).toEqual(future);
    expect(s.audits[0]?.metadata.expiresAt).toBe(future.toISOString());
  });

  it("authorizes permission.grant with the subject, concealed", async () => {
    const s = setup();
    await s.grant({
      actor: coordinator(),
      userId: T,
      input: { permission: "event.manage", scope: "CHAPTER", chapterId: CH },
    });
    expect(s.authorize).toHaveBeenCalledWith(
      expect.anything(),
      "permission.grant",
      { subjectUserId: T, concealed: true }
    );
  });

  it("404s a missing user", async () => {
    const s = setup({ targetExists: false });
    await expect(
      s.grant({
        actor: coordinator(),
        userId: T,
        input: { permission: "event.manage", scope: "CHAPTER", chapterId: CH },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
