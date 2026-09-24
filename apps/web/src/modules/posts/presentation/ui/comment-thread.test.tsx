import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { CommentThread } from "./comment-thread";

const postId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";

const comments = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    postId,
    authorId,
    body: "**bold** <script>alert(1)</script>",
    deleted: false,
    createdAt: new Date("2026-01-01"),
    author: {
      id: authorId,
      fullName: "Author",
      headline: null,
      hasPhoto: false,
    },
  },
];

function actions(over: Record<string, unknown> = {}) {
  return {
    onAddComment: vi.fn(async () => ({
      ok: true as const,
      data: { commentId: "new" },
    })),
    onDeleteComment: vi.fn(async () => ({ ok: true as const, data: {} })),
    ...over,
  };
}

describe("CommentThread", () => {
  it("renders comments through MarkdownView, never as raw HTML", () => {
    render(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={otherId}
        {...actions()}
      />
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows a delete affordance only for the caller's own comments", () => {
    const { rerender } = render(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={otherId}
        {...actions()}
      />
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    rerender(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={authorId}
        {...actions()}
      />
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls onDeleteComment with the comment id", async () => {
    const a = actions();
    render(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={authorId}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(a.onDeleteComment).toHaveBeenCalledWith(comments[0]!.id);
  });

  it("submits a new comment body via onAddComment and clears the form", async () => {
    const a = actions();
    render(
      <CommentThread
        postId={postId}
        comments={[]}
        currentUserId={otherId}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/add a comment/i), "Nice post!");
    await user.click(screen.getByRole("button", { name: /post comment/i }));
    expect(a.onAddComment).toHaveBeenCalledWith(postId, {
      body: "Nice post!",
    });
    expect(screen.getByLabelText(/add a comment/i)).toHaveValue("");
  });
});
