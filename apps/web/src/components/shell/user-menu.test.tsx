import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut, push } = vi.hoisted(() => ({
  signOut: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
  push: vi.fn(),
}));
vi.mock("@/modules/auth/presentation/auth-client", () => ({
  authClient: { signOut },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { UserMenu } from "./user-menu";

const user = {
  id: "u1",
  name: "Asha Rao",
  headline: "SDE",
  photoUrl: null,
  tick: null,
};

describe("UserMenu", () => {
  beforeEach(() => {
    signOut.mockClear();
    push.mockClear();
  });

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

  it("goes to /login only when sign-out succeeds", async () => {
    render(<UserMenu user={user} />);
    await userEvent.click(
      screen.getByRole("button", { name: /account menu/i })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out" })
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it.each([
    ["returns an error", () => Promise.resolve({ error: { status: 500 } })],
    ["throws", () => Promise.reject(new Error("offline"))],
  ])("stays on the page when sign-out %s", async (_, outcome) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signOut.mockImplementationOnce(outcome);
    render(<UserMenu user={user} />);
    await userEvent.click(
      screen.getByRole("button", { name: /account menu/i })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Sign out" })
    );
    expect(
      await screen.findByRole("menuitem", { name: /couldn.t sign out/i })
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs out once on a double click", async () => {
    let resolve!: (v: { error: null }) => void;
    signOut.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<UserMenu user={user} />);
    await userEvent.click(
      screen.getByRole("button", { name: /account menu/i })
    );
    const item = await screen.findByRole("menuitem", { name: "Sign out" });
    await userEvent.click(item);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Signing out…" })
    );
    resolve({ error: null });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
