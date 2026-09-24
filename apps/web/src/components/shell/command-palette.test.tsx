import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { CommandPalette } from "./command-palette";
import type { NavModel } from "./nav-model";

const nav: NavModel = {
  groups: [
    {
      label: null,
      entries: [
        { href: "/dashboard", label: "Home", icon: "home" },
        { href: "/directory", label: "Directory", icon: "directory" },
      ],
    },
  ],
  create: [],
  tabs: [],
};

describe("CommandPalette", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("opens on Cmd+K", async () => {
    render(<CommandPalette nav={nav} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("filters options by query", async () => {
    render(<CommandPalette nav={nav} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");

    await userEvent.type(input, "dir");

    expect(screen.getByRole("option", { name: "Directory" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Home" })
    ).not.toBeInTheDocument();
  });

  it("offers a directory search option for a query with no matching entry", async () => {
    render(<CommandPalette nav={nav} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");

    await userEvent.type(input, "asha");

    expect(
      screen.getByRole("option", { name: 'Search the directory for "asha"' })
    ).toBeVisible();
  });

  it("Enter navigates to the first option: a matching nav entry", async () => {
    render(<CommandPalette nav={nav} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");

    await userEvent.type(input, "dir");
    await userEvent.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/directory");
  });

  it("Enter navigates to the first option: the directory search fallback", async () => {
    render(<CommandPalette nav={nav} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = await screen.findByRole("combobox");

    await userEvent.type(input, "asha");
    await userEvent.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/directory?q=asha");
  });

  it("ArrowDown and ArrowUp move aria-selected", async () => {
    render(<CommandPalette nav={nav} />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("combobox");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("also opens on the open-command-palette window event", async () => {
    render(<CommandPalette nav={nav} />);
    window.dispatchEvent(new Event("open-command-palette"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
