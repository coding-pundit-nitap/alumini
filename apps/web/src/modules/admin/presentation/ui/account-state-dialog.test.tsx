import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AccountStateDialog } from "./account-state-dialog";

describe("AccountStateDialog", () => {
  it("sends userId, accountState and the chosen reason; the actor is never a field", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(form: FormData) => Promise<ActionResult<unknown>>>(
      async () => ({
        ok: true as const,
        data: {},
      })
    );
    render(
      <AccountStateDialog
        userId="u1"
        userName="Ann"
        to="SUSPENDED"
        action={action}
        disabledReason={undefined}
      />
    );
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "SPAM");
    await user.click(screen.getByRole("button", { name: "Suspend Ann" }));
    const form = action.mock.calls[0]![0];
    expect(Object.fromEntries(form)).toEqual({
      userId: "u1",
      accountState: "SUSPENDED",
      reason: "SPAM",
    });
  });

  it("sends no reason when reinstating", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(form: FormData) => Promise<ActionResult<unknown>>>(
      async () => ({
        ok: true as const,
        data: {},
      })
    );
    render(
      <AccountStateDialog
        userId="u1"
        userName="Ann"
        to="VERIFIED"
        action={action}
        disabledReason={undefined}
      />
    );
    await user.click(screen.getByRole("button", { name: "Reinstate" }));
    await user.click(screen.getByRole("button", { name: "Reinstate Ann" }));
    expect(Object.fromEntries(action.mock.calls[0]![0])).toEqual({
      userId: "u1",
      accountState: "VERIFIED",
    });
  });

  it("is disabled with its reason shown", () => {
    render(
      <AccountStateDialog
        userId="u1"
        userName="Ann"
        to="SUSPENDED"
        action={vi.fn()}
        disabledReason="This is the last active Super Admin."
      />
    );
    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(
      screen.getByText("This is the last active Super Admin.")
    ).toBeInTheDocument();
  });
});
