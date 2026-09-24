import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { AccessOptions } from "../../domain/escalation";
import { ESCALATION_MESSAGES } from "../../domain/escalation";
import { GrantPermissionDialog } from "./grant-permission-dialog";

const options: AccessOptions = {
  target: undefined,
  roles: [],
  permissions: [
    { permission: "event.manage", global: "CHAPTER_ONLY", chapter: undefined },
    {
      permission: "system.configure",
      global: "ACCESS_ADMIN",
      chapter: "NOT_SCOPABLE",
    },
  ],
};
const chapters = [{ id: "c1", slug: "delhi" }];

function setup() {
  const action = vi.fn<(form: FormData) => Promise<ActionResult<unknown>>>(
    async () => ({
      ok: true as const,
      data: {},
    })
  );
  render(
    <GrantPermissionDialog
      userId="u1"
      options={options}
      chapters={chapters}
      action={action}
      disabledReason={undefined}
    />
  );
  return { action, user: userEvent.setup() };
}

describe("GrantPermissionDialog", () => {
  it("disables a permission no scope allows, with the reason beside it", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Grant permission" }));
    const option = screen.getByRole("option", { name: /system\.configure/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent(ESCALATION_MESSAGES.ACCESS_ADMIN);
  });

  it("reveals the chapter select for Chapter and sends a chapter grant without expiresAt", async () => {
    const { user, action } = setup();
    await user.click(screen.getByRole("button", { name: "Grant permission" }));
    await user.selectOptions(
      screen.getByLabelText("Permission"),
      "event.manage"
    );
    expect(screen.queryByLabelText("Chapter")).toBeNull();
    expect(screen.getByRole("option", { name: /Global/ })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Scope"), "CHAPTER");
    await user.selectOptions(screen.getByLabelText("Chapter"), "c1");
    await user.click(screen.getByRole("button", { name: "Grant" }));
    expect(Object.fromEntries(action.mock.calls[0]![0])).toEqual({
      userId: "u1",
      permission: "event.manage",
      scope: "CHAPTER",
      chapterId: "c1",
    });
  });

  it("sends expiresAt as an ISO instant when filled", async () => {
    const { user, action } = setup();
    await user.click(screen.getByRole("button", { name: "Grant permission" }));
    await user.selectOptions(
      screen.getByLabelText("Permission"),
      "event.manage"
    );
    await user.selectOptions(screen.getByLabelText("Scope"), "CHAPTER");
    await user.selectOptions(screen.getByLabelText("Chapter"), "c1");
    await user.type(
      screen.getByLabelText("Expires (optional)"),
      "2030-01-02T03:04"
    );
    await user.click(screen.getByRole("button", { name: "Grant" }));
    expect(Object.fromEntries(action.mock.calls[0]![0])).toMatchObject({
      expiresAt: new Date("2030-01-02T03:04").toISOString(),
    });
  });
});
