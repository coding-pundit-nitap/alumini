import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AssignRoleDialog } from "./assign-role-dialog";

const options = {
  target: undefined,
  roles: [
    { name: "STUDENT", reason: undefined },
    { name: "ALUMNI", reason: undefined },
  ],
  permissions: [],
};

describe("AssignRoleDialog", () => {
  it("starts empty again after a successful assign", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(form: FormData) => Promise<ActionResult<unknown>>>(
      async () => ({ ok: true as const, data: {} })
    );
    render(
      <AssignRoleDialog
        userId="u1"
        current={[]}
        options={options}
        disabledReason={undefined}
        action={action}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    await user.selectOptions(screen.getByLabelText("Role"), "STUDENT");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(Object.fromEntries(action.mock.calls[0]![0])).toEqual({
      userId: "u1",
      role: "STUDENT",
    });

    await user.click(screen.getByRole("button", { name: "Assign role" }));
    expect(screen.getByLabelText("Role")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
  });

  it("clears a failure message when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(form: FormData) => Promise<ActionResult<unknown>>>(
      async () => ({
        ok: false as const,
        error: { code: "ROLE_ALREADY_HELD", message: "Already held." },
        requestId: "r1",
      })
    );
    render(
      <AssignRoleDialog
        userId="u1"
        current={[]}
        options={options}
        disabledReason={undefined}
        action={action}
      />
    );
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    await user.selectOptions(screen.getByLabelText("Role"), "STUDENT");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already held.");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Assign role" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
