import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/jobs/mine" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/modules/auth/presentation/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

import { render, screen, within } from "../../../tests/support/test-utils";
import { CreateMenu } from "./create-menu";
import { MobileBar } from "./mobile-bar";
import { buildNav } from "./nav-model";
import { Rail } from "./rail";

const user = {
  id: "u1",
  name: "Asha Rao",
  headline: null,
  photoUrl: null,
  tick: null,
};
const fullNav = buildNav({
  accountState: "VERIFIED",
  can: () => true,
  isMentor: true,
});

beforeEach(() => {
  nav.pathname = "/jobs/mine";
});

describe("Rail", () => {
  it("lights the longest matching entry, opens search and shows the bell", async () => {
    const opened = vi.fn();
    window.addEventListener("open-command-palette", opened);
    render(<Rail nav={fullNav} user={user} bell={<span>bell</span>} />);
    const primary = within(screen.getByRole("navigation", { name: "Primary" }));
    const current = primary.getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/jobs/mine");
    expect(screen.getByText("bell")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(opened).toHaveBeenCalled();
    window.removeEventListener("open-command-palette", opened);
  });
});

describe("MobileBar", () => {
  it("marks the current tab, and More when the page is not a tab", () => {
    nav.pathname = "/dashboard";
    const { unmount } = render(
      <MobileBar nav={fullNav} user={user} bell={null} />
    );
    const tabs = within(screen.getByRole("navigation", { name: "Mobile" }));
    expect(tabs.getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    unmount();

    nav.pathname = "/admin/audit";
    render(<MobileBar nav={fullNav} user={user} bell={null} />);
    expect(
      within(screen.getByRole("navigation", { name: "Mobile" })).queryByRole(
        "link",
        { current: "page" }
      )
    ).toBeNull();
    expect(screen.getByRole("button", { name: "More" })).toHaveClass(
      "text-brand"
    );
  });

  it("opens the full menu from More, with create actions, and closes it on navigation", async () => {
    nav.pathname = "/dashboard";
    document.body.insertAdjacentHTML(
      "beforeend",
      '<textarea id="compose"></textarea>'
    );
    render(<MobileBar nav={fullNav} user={user} bell={null} />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.getByText("Menu")).toBeInTheDocument();
    const post = sheet.getByRole("link", { name: "Post" });
    await userEvent.click(post);
    expect(document.activeElement?.id).toBe("compose");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("link", {
        name: /Jobs/,
      })[0]!
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    document.getElementById("compose")?.remove();
  });

  it("searches from the top bar", async () => {
    const opened = vi.fn();
    window.addEventListener("open-command-palette", opened);
    render(<MobileBar nav={fullNav} user={user} bell={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(opened).toHaveBeenCalled();
    window.removeEventListener("open-command-palette", opened);
  });
});

describe("CreateMenu", () => {
  it("renders nothing without actions and one plain link for a single action", () => {
    const { container, unmount } = render(<CreateMenu actions={[]} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<CreateMenu actions={[{ href: "/jobs/new", label: "Job" }]} />);
    expect(screen.getByRole("link", { name: "Create job" })).toHaveAttribute(
      "href",
      "/jobs/new"
    );
  });

  it("opens a menu for several actions", async () => {
    render(
      <CreateMenu
        actions={[
          { href: "/dashboard#compose", label: "Post" },
          { href: "/jobs/new", label: "Job" },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("menuitem", { name: "Job" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "Post" }));
  });
});
