import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  render,
  screen,
  within,
} from "../../../../../tests/support/test-utils";
import { RetentionDialog } from "./retention-dialog";
import { UserFilters } from "./user-filters";
import { UsersTable } from "./users-table";

describe("UsersTable", () => {
  it("says when no user matches", () => {
    render(<UsersTable rows={[]} />);
    expect(
      screen.getByText("No users match these filters.")
    ).toBeInTheDocument();
  });

  it("links each user to their page with state and roles", () => {
    render(
      <UsersTable
        rows={[
          {
            id: "u1",
            name: "Asha Rao",
            email: "asha@example.test",
            accountState: "VERIFIED",
            roles: ["ALUMNI", "MODERATOR"],
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
          {
            id: "u2",
            name: "Odd",
            email: "odd@example.test",
            accountState: "MYSTERY",
            roles: [],
            createdAt: new Date("2026-01-02T00:00:00Z"),
          },
        ]}
      />
    );
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute(
      "href",
      "/admin/users/u1"
    );
    expect(screen.getByText("MODERATOR")).toBeInTheDocument();
    expect(screen.getByText("MYSTERY")).toBeInTheDocument();
  });
});

describe("UserFilters", () => {
  it("keeps the current filters in a plain GET form", () => {
    render(
      <UserFilters
        values={{ q: "asha", state: "PENDING", role: "ALUMNI" }}
        roles={["ALUMNI", "STUDENT"]}
      />
    );
    expect(screen.getByLabelText("Search")).toHaveValue("asha");
    expect(screen.getByLabelText("State")).toHaveValue("PENDING");
    expect(screen.getByLabelText("Role")).toHaveValue("ALUMNI");
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/admin/users"
    );
  });

  it("starts empty with no filters", () => {
    render(<UserFilters values={{}} roles={[]} />);
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(screen.getByLabelText("Role")).toHaveValue("");
  });
});

describe("RetentionDialog", () => {
  const setting = {
    id: "s1",
    category: "notifications",
    retentionDays: 90,
    approvedBy: null,
    updatedAt: new Date(),
    updatedBy: null,
    defaultDays: 90,
    minDays: 30,
    maxDays: 365,
    enforced: true,
  };

  it("posts the new period and sign-off, and needs a period", async () => {
    const action = vi.fn<
      (form: FormData) => Promise<{ ok: true; data: Record<string, never> }>
    >(async () => ({ ok: true, data: {} }));
    render(<RetentionDialog setting={setting} action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText("Retention: Notifications")).toBeInTheDocument();
    expect(dialog.getByText("Between 30 and 365 days.")).toBeInTheDocument();
    const days = dialog.getByLabelText("Days");
    await userEvent.clear(days);
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.type(days, "120");
    await userEvent.type(dialog.getByLabelText("Approved by"), "Registrar");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    const form = action.mock.calls[0]![0];
    expect(Object.fromEntries(form.entries())).toEqual({
      category: "notifications",
      retentionDays: "120",
      approvedBy: "Registrar",
    });
  });

  it("resets unsaved edits when closed, and names an unknown category by its key", async () => {
    render(
      <RetentionDialog
        setting={{ ...setting, category: "custom", approvedBy: "Dean" }}
        action={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Retention: custom")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Days"), "9");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Days")).toHaveValue(90);
    expect(screen.getByLabelText("Approved by")).toHaveValue("Dean");
  });
});
