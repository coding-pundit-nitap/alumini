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
});
