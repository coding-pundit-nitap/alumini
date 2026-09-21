import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { SkillForm } from "./skill-form";
import type { ItemAction } from "./detail-form-support";

describe("SkillForm", () => {
  it("submits the skill field and clears it after a successful add", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(<SkillForm action={action} />);

    await user.type(screen.getByLabelText("Add a skill"), "TypeScript");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![0].get("skill")).toBe("TypeScript");
  });

  it("shows the error the action returns", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "PROFILE_LIMIT_REACHED",
        message: "You have reached the limit for this section.",
      },
      requestId: "r",
    }));
    const user = userEvent.setup();
    render(<SkillForm action={action} />);
    await user.type(screen.getByLabelText("Add a skill"), "Go");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await screen.findByText("You have reached the limit for this section.")
    ).toBeInTheDocument();
  });

  it("edit mode: prefills the skill, labels the button Save, and sends the item id", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(
      <SkillForm
        action={action}
        id="11111111-1111-4111-8111-111111111111"
        defaults={{ skill: "TypeScript" }}
      />
    );
    expect(screen.getByLabelText("Skill")).toHaveValue("TypeScript");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![0].get("id")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });
});
