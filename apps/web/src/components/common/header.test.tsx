import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  can: vi.fn(),
  hasAdminAccess: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor, can: mocks.can }));
vi.mock("@/modules/admin", () => ({ hasAdminAccess: mocks.hasAdminAccess }));
vi.mock("@/modules/notifications", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

import { Header } from "./header";

describe("Header", () => {
  it("shows the public nav when signed out", async () => {
    mocks.getActor.mockResolvedValue(null);
    mocks.hasAdminAccess.mockReturnValue(false);

    render(await Header());

    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("notification-bell")).not.toBeInTheDocument();
  });

  it("shows the member nav and bell when signed in", async () => {
    mocks.getActor.mockResolvedValue({ userId: "u1" });
    mocks.hasAdminAccess.mockReturnValue(false);

    render(await Header());

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Log in" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Admin" })
    ).not.toBeInTheDocument();
  });

  it("shows the Admin link for admins", async () => {
    mocks.getActor.mockResolvedValue({ userId: "u1" });
    mocks.hasAdminAccess.mockReturnValue(true);

    render(await Header());

    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });
});
