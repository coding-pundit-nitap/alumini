import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { BadgeRolePicker } from "./badge-role-picker";

const options = [
  { role: "MODERATOR", label: "Moderator", kind: "team" as const },
  { role: "ALUMNI", label: "Alumni", kind: "alumni" as const },
];

describe("BadgeRolePicker", () => {
  it("offers automatic, each held role and none, and saves the pick", async () => {
    const action = vi.fn(async () => ({
      ok: true as const,
      data: { saved: true as const },
    }));
    render(<BadgeRolePicker options={options} choice="AUTO" action={action} />);
    expect(screen.getByRole("radio", { name: /Automatic/ })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Don't show a tick/ })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /^Alumni/ }));
    expect(action).toHaveBeenCalledWith("ALUMNI");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("puts the old choice back when saving fails", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: { code: "X", message: "Choose one of your roles." },
      requestId: "r",
    }));
    render(<BadgeRolePicker options={options} choice="AUTO" action={action} />);
    await userEvent.click(screen.getByRole("radio", { name: /^Alumni/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose one");
    expect(screen.getByRole("radio", { name: /Automatic/ })).toBeChecked();
  });
});
