import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ReactionPicker } from "./reaction-picker";

const postId = "11111111-1111-4111-8111-111111111111";

function actions() {
  return {
    onReact: vi.fn(async () => ({ ok: true as const, data: {} })),
    onUnreact: vi.fn(async () => ({ ok: true as const, data: {} })),
  };
}

describe("ReactionPicker", () => {
  it("renders the four fixed reaction types as buttons", () => {
    render(<ReactionPicker postId={postId} mine={null} {...actions()} />);
    expect(screen.getByRole("button", { name: /like/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /celebrate/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /support/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /insightful/i })
    ).toBeInTheDocument();
  });

  it("calls onReact with the postId and reaction type when an unreacted type is clicked", async () => {
    const a = actions();
    render(<ReactionPicker postId={postId} mine={null} {...a} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /celebrate/i }));
    expect(a.onReact).toHaveBeenCalledWith(postId, { type: "CELEBRATE" });
    expect(a.onUnreact).not.toHaveBeenCalled();
  });

  it("calls onUnreact when the caller's own active reaction is clicked again", async () => {
    const a = actions();
    render(<ReactionPicker postId={postId} mine="LIKE" {...a} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /like/i }));
    expect(a.onUnreact).toHaveBeenCalledWith(postId);
    expect(a.onReact).not.toHaveBeenCalled();
  });

  it("marks the caller's active reaction as pressed", () => {
    render(<ReactionPicker postId={postId} mine="SUPPORT" {...actions()} />);
    expect(screen.getByRole("button", { name: /support/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /like/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
