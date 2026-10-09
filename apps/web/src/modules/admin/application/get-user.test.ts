import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { AdminStore, UserDetail } from "./admin-store";
import { createGetUser } from "./get-user";

const T = "00000000-0000-4000-8000-0000000000bb";
const actor = {
  userId: "00000000-0000-4000-8000-0000000000aa",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [{ permission: "role.assign", scope: "GLOBAL", expiresAt: null }],
} as Actor;
const detail = {
  id: T,
  roles: [],
  grants: [],
  isLastSuperAdmin: false,
} as unknown as UserDetail;
const deps = (user: UserDetail | null) => ({
  store: {
    getUser: vi.fn(async () => user),
    listChapters: vi.fn(async () => []),
  } as unknown as AdminStore,
  authorize: vi.fn(() => actor),
  loadGrants: vi.fn(async () => [
    { permission: "role.assign", scope: "GLOBAL" as const, expiresAt: null },
  ]),
  roles: {
    STUDENT: ["post.create" as const],
    INSTITUTE_ADMIN: ["role.assign" as const],
  },
  superAdminRole: "SUPER_ADMIN",
});

describe("getUser", () => {
  it("authorizes with the subject, concealed", async () => {
    const d = deps(detail);
    await createGetUser(d)({ actor, userId: T });
    expect(d.authorize).toHaveBeenCalledWith(actor, "user.read_admin", {
      subjectUserId: T,
      concealed: true,
    });
  });
  it("404s an unknown user", async () => {
    await expect(
      createGetUser(deps(null))({ actor, userId: T })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
  it("computes access options from the same rules (protected target, admin role)", async () => {
    const view = await createGetUser(deps(detail))({ actor, userId: T });
    expect(view.options.target).toBe("PROTECTED_TARGET");
    expect(
      view.options.roles.find((r) => r.name === "INSTITUTE_ADMIN")?.reason
    ).toBe("ADMIN_ROLE");
    expect(
      view.options.roles.find((r) => r.name === "STUDENT")?.reason
    ).toBeUndefined();
    expect(view.isSelf).toBe(false);
  });
});
