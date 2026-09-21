import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { ExperienceForm } from "./experience-form";
import type { ItemAction } from "./detail-form-support";

describe("ExperienceForm", () => {
  it("submits company, designation, dates and is-current, with no id (add mode)", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(<ExperienceForm action={action} />);

    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.type(screen.getByLabelText("Role"), "Engineer");
    await user.type(screen.getByLabelText("Start date"), "2020-01-15");
    await user.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0];
    expect(sent.get("company")).toBe("Acme");
    expect(sent.get("designation")).toBe("Engineer");
    expect(sent.get("startDate")).toBe("2020-01-15");
    expect(sent.get("id")).toBeNull();
  });

  it("disables and clears the end date when 'current role' is checked", async () => {
    const user = userEvent.setup();
    render(<ExperienceForm action={vi.fn()} />);
    await user.type(screen.getByLabelText("End date"), "2021-01-01");
    await user.click(screen.getByLabelText("I currently work here"));
    expect(screen.getByLabelText("End date")).toBeDisabled();
    expect(screen.getByLabelText("End date")).toHaveValue("");
  });

  it("edit mode: prefills fields and sends the item id", async () => {
    const action = vi.fn<ItemAction>(async () => ({
      ok: true,
      data: undefined,
    }));
    const user = userEvent.setup();
    render(
      <ExperienceForm
        action={action}
        id="11111111-1111-4111-8111-111111111111"
        defaults={{
          company: "Acme",
          industry: null,
          designation: "Engineer",
          startDate: "2020-01-01",
          endDate: null,
          isCurrent: true,
        }}
      />
    );
    expect(screen.getByLabelText("Company")).toHaveValue("Acme");
    expect(screen.getByLabelText("I currently work here")).toBeChecked();
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]![0].get("id")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("shows the field error the action returns", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "VALIDATION_FAILED",
        message: "The request contains invalid fields.",
        fields: { company: "Enter the company." },
      },
      requestId: "r",
    }));
    const user = userEvent.setup();
    render(<ExperienceForm action={action} />);
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(await screen.findByText("Enter the company.")).toBeInTheDocument();
  });
});
