import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  send: vi.fn(),
  push: vi.fn(),
}));

vi.mock("../auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    sendVerificationEmail: mocks.send,
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

import { LoginForm } from "./login-form";

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "asha@example.test");
  await user.type(screen.getByLabelText("Password"), "whatever-it-is");
}

beforeEach(() => {
  mocks.signIn.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.send.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.push.mockReset();
});

describe("LoginForm", () => {
  it("signs in and lets the server choose the landing page, passing next along", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/profile?tab=edu" />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(mocks.signIn).toHaveBeenCalledWith({
        email: "asha@example.test",
        password: "whatever-it-is",
      })
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/post-login?next=%2Fprofile%3Ftab%3Dedu"
    );
  });

  it("shows one message for a wrong password", async () => {
    mocks.signIn.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect."
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("offers a new confirmation link when the email is not confirmed", async () => {
    mocks.signIn.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", status: 403 },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/confirm your email/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /send a new link/i }));
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ email: "asha@example.test" })
    );
  });
});
