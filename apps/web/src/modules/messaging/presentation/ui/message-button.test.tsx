import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { MessageButton } from "./message-button";

beforeEach(() => push.mockClear());

describe("MessageButton", () => {
  it("starts the conversation and opens the thread", async () => {
    const startAction = vi.fn(async () => ({
      ok: true as const,
      data: { conversationId: "c9" },
    }));
    render(<MessageButton recipientId="ravi" startAction={startAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Message" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/messages/c9"));
    expect(startAction).toHaveBeenCalledWith("ravi");
  });

  it("shows the safe message when the conversation cannot be started, and does not navigate", async () => {
    const startAction = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "MESSAGE_BLOCKED",
        message: "You have blocked this member. Unblock them to message them.",
      },
      requestId: "r",
    }));
    render(<MessageButton recipientId="ravi" startAction={startAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have blocked this member."
    );
    expect(push).not.toHaveBeenCalled();
  });
});
