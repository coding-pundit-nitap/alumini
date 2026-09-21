import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../auth-client", () => ({
  authClient: { requestPasswordReset: mocks.request },
}));

import { ForgotPasswordForm } from "./forgot-password-form";

beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("ForgotPasswordForm", () => {
  it("asks for the reset with the reset-password page as the destination", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "asha@example.test");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(mocks.request).toHaveBeenCalledWith({
      email: "asha@example.test",
      redirectTo: "/reset-password",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /if an account exists/i
    );
  });

  it("gives the same confirmation when the request fails for a reason other than a rate limit", async () => {
    mocks.request.mockResolvedValue({ data: null, error: { status: 500 } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "nobody@example.test");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /if an account exists/i
    );
  });

  it("reports a rate limit", async () => {
    mocks.request.mockResolvedValue({ data: null, error: { status: 429 } });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "asha@example.test");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many/i);
  });
});
