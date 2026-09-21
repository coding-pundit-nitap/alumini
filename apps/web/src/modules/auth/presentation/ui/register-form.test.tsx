import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), push: vi.fn() }));

vi.mock("../auth-client", () => ({
  authClient: { signUp: { email: mocks.signUp } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));

import { RegisterForm } from "./register-form";

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Asha Rao");
  await user.type(screen.getByLabelText("Email"), "asha@example.test");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
}

beforeEach(() => {
  mocks.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.push.mockReset();
});

describe("RegisterForm", () => {
  it("shows field errors and does not call the API for empty input", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("signs up with the verify-email callback and moves to check-your-email", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith({
        name: "Asha Rao",
        email: "asha@example.test",
        password: "correct-horse-battery",
        callbackURL: "/verify-email?status=confirmed",
      })
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/register/check-email?email=asha%40example.test"
    );
  });

  it("treats 'already registered' exactly like success (enumeration protection)", async () => {
    mocks.signUp.mockResolvedValue({
      data: null,
      error: { code: "USER_ALREADY_EXISTS", status: 422 },
    });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(screen.queryByText(/already/i)).not.toBeInTheDocument();
  });

  it("shows a mapped message and stays on the page for other errors", async () => {
    mocks.signUp.mockResolvedValue({ data: null, error: { status: 429 } });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many/i);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
