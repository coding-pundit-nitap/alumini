import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("../auth-client", () => ({
  authClient: { sendVerificationEmail: mocks.send },
}));

import { ResendVerification } from "./resend-verification";

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("ResendVerification", () => {
  it("resends to a known address and confirms without confirming the account exists", async () => {
    const user = userEvent.setup();
    render(<ResendVerification email="asha@example.test" />);

    await user.click(screen.getByRole("button", { name: /send a new link/i }));

    expect(mocks.send).toHaveBeenCalledWith({
      email: "asha@example.test",
      callbackURL: "/verify-email?status=confirmed",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /if this address needs confirming/i
    );
  });

  it("asks for the address when none is known", async () => {
    const user = userEvent.setup();
    render(<ResendVerification />);

    await user.type(screen.getByLabelText("Email"), "asha@example.test");
    await user.click(screen.getByRole("button", { name: /send a new link/i }));

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ email: "asha@example.test" })
    );
  });

  it("shows the rate-limit message on a 429", async () => {
    mocks.send.mockResolvedValue({ data: null, error: { status: 429 } });
    const user = userEvent.setup();
    render(<ResendVerification email="asha@example.test" />);

    await user.click(screen.getByRole("button", { name: /send a new link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many/i);
  });
});
