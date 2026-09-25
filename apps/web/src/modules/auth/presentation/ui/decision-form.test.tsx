import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}));

import { DecisionForm } from "./decision-form";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => mocks.refresh.mockReset());

describe("DecisionForm", () => {
  it("asks for confirmation before approving, and sends once", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({
      ok: true as const,
      data: { outcome: "decided" as const },
    }));
    render(<DecisionForm requestId="r1" action={action} />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Approve request" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("cancelling the confirmation sends nothing", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<DecisionForm requestId="r1" action={action} />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("a reject without a note is refused before any confirmation opens", async () => {
    const user = userEvent.setup();
    render(<DecisionForm requestId="r1" action={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/note is required/i);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("approves without a note", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { outcome: "decided" } });
    const user = userEvent.setup();
    render(<DecisionForm requestId={id} action={action} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const sent = action.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(sent.entries())).toEqual({
      requestId: id,
      decision: "APPROVED",
      note: "",
    });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("will not reject without a note, and does not call the action", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(<DecisionForm requestId={id} action={action} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/note is required/i);
  });

  it("rejects with the note", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { outcome: "decided" } });
    const user = userEvent.setup();
    render(<DecisionForm requestId={id} action={action} />);

    await user.type(screen.getByLabelText(/note/i), "Roll number not found.");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Reject request" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(
      Object.fromEntries((action.mock.calls[0]![0] as FormData).entries())
    ).toMatchObject({
      decision: "REJECTED",
      note: "Roll number not found.",
    });
  });

  it("says so when another reviewer already decided, and refreshes the queue", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { outcome: "already_decided" } });
    const user = userEvent.setup();
    render(<DecisionForm requestId={id} action={action} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /already been decided/i
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("shows the server's message for a failed decision", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "SELF_REVIEW_FORBIDDEN",
        message: "You cannot review your own request.",
      },
      requestId: "r",
    });
    const user = userEvent.setup();
    render(<DecisionForm requestId={id} action={action} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /cannot review your own/i
    );
  });
});
