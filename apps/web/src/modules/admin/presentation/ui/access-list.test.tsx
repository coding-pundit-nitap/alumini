import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { UserDetail } from "../../application/admin-store";
import { ESCALATION_MESSAGES } from "../../domain/escalation";
import { AccessList } from "./access-list";

const by = { id: "a1", name: "Admin" };
const user: UserDetail = {
  id: "u1",
  name: "Ann",
  email: "ann@x.test",
  accountState: "VERIFIED",
  deactivatedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  roles: [],
  grants: [
    {
      id: "g1",
      permission: "event.manage",
      scope: "GLOBAL",
      chapterId: null,
      chapterSlug: null,
      grantedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: null,
      grantedBy: by,
    },
    {
      id: "g2",
      permission: "event.manage",
      scope: "CHAPTER",
      chapterId: "c1",
      chapterSlug: "delhi",
      grantedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: null,
      grantedBy: by,
    },
  ],
  isLastSuperAdmin: false,
};

describe("AccessList", () => {
  it("disables revoking a grant the viewer could not issue (E2), in that grant's scope only", () => {
    render(
      <AccessList
        user={user}
        options={{
          target: undefined,
          roles: [],
          permissions: [
            {
              permission: "event.manage",
              global: "CHAPTER_ONLY",
              chapter: undefined,
            },
          ],
        }}
        superAdminRole="SUPER_ADMIN"
        blocked={undefined}
        now={new Date("2026-06-01T00:00:00Z")}
        revokeGrant={vi.fn()}
      />
    );
    const [global, chapter] = screen.getAllByRole("button", {
      name: "Revoke",
    });
    expect(global).toBeDisabled();
    expect(global).toHaveAccessibleDescription(
      ESCALATION_MESSAGES.CHAPTER_ONLY
    );
    expect(chapter).toBeEnabled();
  });

  const roles = (...names: string[]) =>
    names.map((name) => ({
      name,
      grantedBy: by,
      grantedAt: new Date("2026-01-01T00:00:00Z"),
    }));
  const noOptions = { target: undefined, roles: [], permissions: [] };

  it("says when there are no roles or grants, and offers no actions without permission", () => {
    render(
      <AccessList
        user={{ ...user, grants: [] }}
        options={noOptions}
        superAdminRole="SUPER_ADMIN"
        blocked={undefined}
        now={new Date()}
      />
    );
    expect(screen.getByText("No roles.")).toBeInTheDocument();
    expect(screen.getByText("No direct grants.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains why a role cannot be removed: blocked, escalation, or the last Super Admin", () => {
    const { unmount } = render(
      <AccessList
        user={{
          ...user,
          roles: roles("SUPER_ADMIN", "MODERATOR", "ALUMNI"),
          isLastSuperAdmin: true,
        }}
        options={{
          ...noOptions,
          roles: [{ name: "MODERATOR", reason: "ADMIN_ROLE" }],
        }}
        superAdminRole="SUPER_ADMIN"
        blocked={undefined}
        now={new Date()}
        revokeRole={vi.fn()}
      />
    );
    const [superAdmin, moderator, alumni] = screen.getAllByRole("button", {
      name: "Remove",
    });
    expect(superAdmin).toHaveAccessibleDescription(
      "This is the last active Super Admin."
    );
    expect(moderator).toHaveAccessibleDescription(
      ESCALATION_MESSAGES.ADMIN_ROLE
    );
    expect(alumni).toBeEnabled();
    unmount();

    render(
      <AccessList
        user={{ ...user, roles: roles("ALUMNI") }}
        options={noOptions}
        superAdminRole="SUPER_ADMIN"
        blocked="You cannot change your own access."
        now={new Date()}
        revokeRole={vi.fn()}
        revokeGrant={vi.fn()}
      />
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleDescription(
        "You cannot change your own access."
      );
    }
  });

  it("marks an expired grant and shows when a grant expires", () => {
    render(
      <AccessList
        user={{
          ...user,
          grants: [
            {
              ...user.grants[0]!,
              expiresAt: new Date("2026-01-15T00:00:00Z"),
            },
            {
              ...user.grants[1]!,
              expiresAt: new Date("2027-01-15T00:00:00Z"),
            },
          ],
        }}
        options={{
          ...noOptions,
          permissions: [
            {
              permission: "event.manage",
              global: undefined,
              chapter: "NOT_SCOPABLE",
            },
          ],
        }}
        superAdminRole="SUPER_ADMIN"
        blocked={undefined}
        now={new Date("2026-06-01T00:00:00Z")}
        revokeGrant={vi.fn()}
      />
    );
    expect(screen.getAllByText("Expired")).toHaveLength(1);
    expect(screen.getByText("Chapter: delhi")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Revoke" })) {
      expect(button).toBeEnabled();
    }
  });
});
