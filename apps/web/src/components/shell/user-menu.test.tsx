import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/modules/auth/presentation/auth-client", () => ({
  authClient: { signOut },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { UserMenu } from "./user-menu";

const user = { id: "u1", name: "Asha Rao", headline: "SDE", photoUrl: null };

describe("UserMenu", () => {
  it("lists the account links, the theme choice and sign out", async () => {
    render(<UserMenu user={user} />);
    expect(screen.getByText("AR")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /account menu/i })
    );

    for (const name of [
      "View profile",
      "Edit details",
      "Privacy",
      "Notification settings",
      "Sign out",
    ]) {
      expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    }
    for (const name of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("menuitemradio", { name })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
