import userEvent from "@testing-library/user-event";
import { Users } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/admin/users/u1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { render, screen, within } from "../../../tests/support/test-utils";
import type { NavGroup } from "@/modules/admin";

import { AdminRail } from "./admin-rail";
import {
  AdminEmpty,
  AdminPageHeader,
  AdminPager,
  AdminPanel,
} from "./admin-surface";

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "People",
    items: [{ href: "/admin/users", label: "Users", icon: "users" }],
  },
];

beforeEach(() => {
  nav.pathname = "/admin/users/u1";
});

describe("AdminRail", () => {
  it("lights the section a sub-page belongs to, and the dashboard only on itself", () => {
    render(<AdminRail groups={groups} />);
    const rail = within(screen.getByRole("complementary"));
    expect(rail.getByRole("link", { name: "Users" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(rail.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("opens the menu on small screens and closes it on navigation", async () => {
    nav.pathname = "/admin";
    render(<AdminRail groups={groups} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Open admin menu" })
    );
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await userEvent.click(sheet.getByRole("link", { name: "Users" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Open admin menu" })
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("link", {
        name: "Back to app",
      })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("admin surfaces", () => {
  it("renders a header with back link, description, extra content and actions", () => {
    render(
      <AdminPageHeader
        title="Users"
        description="Everyone"
        back={{ href: "/admin", label: "Admin" }}
        actions={<button>Export</button>}
      >
        <p>extra</p>
      </AdminPageHeader>
    );
    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(screen.getByText("Everyone")).toBeInTheDocument();
    expect(screen.getByText("extra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("renders a bare header", () => {
    render(<AdminPageHeader title="Bare" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a panel with and without its header and toolbar", () => {
    const { unmount } = render(
      <AdminPanel
        title="Queue"
        description="Pending"
        actions={<button>Refresh</button>}
        toolbar={<input aria-label="Filter" />}
      >
        rows
      </AdminPanel>
    );
    expect(screen.getByRole("heading", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter")).toBeInTheDocument();
    unmount();
    render(<AdminPanel description="Only a description">rows</AdminPanel>);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("Only a description")).toBeInTheDocument();
  });

  it("renders an empty state and a pager only when there is a next page", () => {
    const { container } = render(
      <>
        <AdminEmpty
          icon={Users}
          title="No users"
          description="Nobody yet"
          action={<button>Invite</button>}
        />
        <AdminEmpty icon={Users} title="Bare" />
        <AdminPager href={null} label="Next" />
        <AdminPager href="/admin/users?cursor=x" label="Next page" />
      </>
    );
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/admin/users?cursor=x"
    );
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });
});
