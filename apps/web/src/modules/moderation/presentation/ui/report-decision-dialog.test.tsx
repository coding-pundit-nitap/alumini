import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ReportDecisionDialog } from "./report-decision-dialog";

describe("ReportDecisionDialog", () => {
  it("requires a reason, then sends the report id and the code", async () => {
    const action = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <ReportDecisionDialog outcome="resolve" reportId="r1" action={action} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const confirm = screen.getByRole("button", { name: "Resolve report" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Reason"), "HARASSMENT");
    await user.click(confirm);
    expect(action).toHaveBeenCalledWith("r1", "HARASSMENT");
  });

  it("offers dismiss codes for dismiss, and shows a server error inline", async () => {
    const action = vi.fn(async () => ({
      ok: false as const,
      error: { code: "INVALID_STATE_TRANSITION", message: "Already decided." },
      requestId: "q",
    }));
    render(
      <ReportDecisionDialog outcome="dismiss" reportId="r1" action={action} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    const select = screen.getByLabelText("Reason");
    expect(
      [...(select as HTMLSelectElement).options].map((o) => o.value)
    ).toEqual(["", "NO_VIOLATION", "DUPLICATE", "INSUFFICIENT_CONTEXT"]);
    await user.selectOptions(select, "DUPLICATE");
    await user.click(screen.getByRole("button", { name: "Dismiss report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Already decided."
    );
  });

  it("is disabled with its reason shown", () => {
    render(
      <ReportDecisionDialog
        outcome="resolve"
        reportId="r1"
        action={vi.fn()}
        disabledReason="You filed this report."
      />
    );
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
    expect(screen.getByText("You filed this report.")).toBeInTheDocument();
  });
});
