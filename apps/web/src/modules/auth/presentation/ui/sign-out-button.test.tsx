import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../auth-client", () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { SignOutButton } from "./sign-out-button";

beforeEach(() => {
  mocks.signOut.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.push.mockReset();
  mocks.refresh.mockReset();
});

describe("SignOutButton", () => {
  it("signs out, then returns to the login page with fresh server data", async () => {
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/login"));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
