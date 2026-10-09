import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const loadShell = vi.hoisted(() => vi.fn());
vi.mock("./load-shell", () => ({ loadShell }));
vi.mock("./rail", () => ({
  Rail: ({ bell }: { bell: React.ReactNode }) => <aside>rail{bell}</aside>,
}));
vi.mock("./mobile-bar", () => ({ MobileBar: () => <header>mobile</header> }));
vi.mock("./command-palette", () => ({ CommandPalette: () => null }));
vi.mock("@/modules/notifications", () => ({
  NotificationBell: () => <span>bell</span>,
}));

import { AppShell } from "./app-shell";

const data = (verified: boolean) => ({
  verified,
  user: { id: "u1", name: "A", headline: null, photoUrl: null, tick: null },
  nav: { groups: [], create: [], tabs: [] },
});

describe("AppShell", () => {
  it("renders only the page when signed out", async () => {
    loadShell.mockResolvedValue(null);
    render(await AppShell({ children: <p>page</p> }));
    expect(screen.getByRole("main")).toHaveTextContent("page");
    expect(screen.queryByText(/rail/)).toBeNull();
  });

  it("wraps the page in the chrome, with the bell only for a verified member", async () => {
    loadShell.mockResolvedValue(data(true));
    const { unmount } = render(await AppShell({ children: <p>page</p> }));
    expect(
      screen.getByRole("link", { name: "Skip to content" })
    ).toHaveAttribute("href", "#main");
    expect(screen.getByText("bell")).toBeInTheDocument();
    unmount();

    loadShell.mockResolvedValue(data(false));
    render(await AppShell({ children: <p>page</p> }));
    expect(screen.queryByText("bell")).toBeNull();
  });
});
