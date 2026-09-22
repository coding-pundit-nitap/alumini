import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  fireEvent,
  render,
  screen,
} from "../../../../../tests/support/test-utils";
import { ReportDialog } from "./report-dialog";

const targetId = "11111111-1111-4111-8111-111111111111";

function actions() {
  return {
    onSubmit: vi.fn(async () => ({
      ok: true as const,
      data: { reportId: "r1", created: true },
    })),
  };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /report/i }));
}

describe("ReportDialog", () => {
  it("disables submit when the reason is empty", async () => {
    render(
      <ReportDialog targetType="POST" targetId={targetId} {...actions()} />
    );
    const user = userEvent.setup();
    await openDialog(user);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("enables submit once a reason is entered and submits the parsed input", async () => {
    const a = actions();
    render(<ReportDialog targetType="POST" targetId={targetId} {...a} />);
    const user = userEvent.setup();
    await openDialog(user);
    await user.type(screen.getByLabelText(/reason/i), "Spam content");
    const submit = screen.getByRole("button", { name: /submit/i });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(a.onSubmit).toHaveBeenCalledWith({
      targetType: "POST",
      targetId,
      reason: "Spam content",
    });
  });

  it("disables submit when the reason exceeds 1000 characters", async () => {
    render(
      <ReportDialog targetType="COMMENT" targetId={targetId} {...actions()} />
    );
    const user = userEvent.setup();
    await openDialog(user);
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "x".repeat(1001) },
    });
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("calls onReported with the new report id after a successful submit", async () => {
    const onReported = vi.fn();
    const a = actions();
    render(
      <ReportDialog
        targetType="POST"
        targetId={targetId}
        onReported={onReported}
        {...a}
      />
    );
    const user = userEvent.setup();
    await openDialog(user);
    await user.type(screen.getByLabelText(/reason/i), "Spam");
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(onReported).toHaveBeenCalledWith("r1");
  });
});
