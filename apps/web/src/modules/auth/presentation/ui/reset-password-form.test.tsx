import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ reset: vi.fn() }));

vi.mock("../auth-client", () => ({
  authClient: { resetPassword: mocks.reset },
}));

import { ResetPasswordForm } from "./reset-password-form";

beforeEach(() => {
  mocks.reset.mockReset().mockResolvedValue({ data: {}, error: null });
});

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm: string
) {
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: /set new password/i }));
}

describe("ResetPasswordForm", () => {
  it("does not call the API when the passwords differ", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="t1" />);

    await fill(user, "correct-horse-battery", "different-horse-battery");

    expect(mocks.reset).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/match/i);
  });

  it("resets with the token and tells the user other devices were signed out", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="t1" />);

    await fill(user, "correct-horse-battery", "correct-horse-battery");

    expect(mocks.reset).toHaveBeenCalledWith({
      newPassword: "correct-horse-battery",
      token: "t1",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /signed out on other devices/i
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  it("shows the mapped message for an invalid or used token", async () => {
    mocks.reset.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", status: 400 },
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="t1" />);

    await fill(user, "correct-horse-battery", "correct-horse-battery");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid or has already been used/i
    );
  });
});
