import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ReactionPicker } from "./reaction-picker";

const postId = "11111111-1111-4111-8111-111111111111";

const counts = { LIKE: 2, CELEBRATE: 1, SUPPORT: 0, INSIGHTFUL: 0 };

function actions(over: Record<string, unknown> = {}) {
  return {
    onReact: vi.fn(async () => ({ ok: true as const, data: {} })),
    onUnreact: vi.fn(async () => ({ ok: true as const, data: {} })),
    ...over,
  };
}

describe("ReactionPicker", () => {
  it("labels the trigger 'Like' with the total count when the caller hasn't reacted", () => {
    render(
      <ReactionPicker
        postId={postId}
        counts={counts}
        mine={null}
        {...actions()}
      />
    );
    const trigger = screen.getByRole("button", { name: /like/i });
    expect(trigger).toHaveTextContent("3");
    expect(trigger).toHaveAttribute("aria-pressed", "false");
  });

  it("labels the trigger with the caller's own reaction and marks it pressed", () => {
    render(
      <ReactionPicker
        postId={postId}
        counts={counts}
        mine="CELEBRATE"
        {...actions()}
      />
    );
    const trigger = screen.getByRole("button", { name: /celebrate/i });
    expect(trigger).toHaveAttribute("aria-pressed", "true");
  });

  it("reacts with LIKE and optimistically increments the count when the trigger is clicked unreacted", async () => {
    const a = actions();
    render(
      <ReactionPicker postId={postId} counts={counts} mine={null} {...a} />
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /like/i });
    await user.click(trigger);
    expect(a.onReact).toHaveBeenCalledWith(postId, { type: "LIKE" });
    expect(trigger).toHaveTextContent("4");
    expect(trigger).toHaveAttribute("aria-pressed", "true");
  });

  it("unreacts and optimistically decrements the count when the trigger is clicked while active", async () => {
    const a = actions();
    render(
      <ReactionPicker postId={postId} counts={counts} mine="LIKE" {...a} />
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /like/i });
    await user.click(trigger);
    expect(a.onUnreact).toHaveBeenCalledWith(postId);
    expect(trigger).toHaveTextContent("2");
    expect(trigger).toHaveAttribute("aria-pressed", "false");
  });

  it("rolls back the optimistic count and pressed state when the action fails", async () => {
    const a = actions({
      onReact: vi.fn(async () => ({
        ok: false as const,
        error: { code: "SOMETHING", message: "nope" },
        requestId: "q",
      })),
    });
    render(
      <ReactionPicker postId={postId} counts={counts} mine={null} {...a} />
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: /like/i });
    await user.click(trigger);
    expect(trigger).toHaveTextContent("3");
    expect(trigger).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a menu of all four reactions with their counts, and switching to Celebrate updates the trigger", async () => {
    const a = actions();
    render(
      <ReactionPicker postId={postId} counts={counts} mine={null} {...a} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /more reactions/i }));
    expect(
      screen.getByRole("menuitem", { name: /like.*2/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /celebrate.*1/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /support.*0/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /insightful.*0/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /celebrate/i }));
    expect(a.onReact).toHaveBeenCalledWith(postId, { type: "CELEBRATE" });
    expect(
      screen.getByRole("button", { name: /celebrate/i })
    ).toBeInTheDocument();
  });
});
