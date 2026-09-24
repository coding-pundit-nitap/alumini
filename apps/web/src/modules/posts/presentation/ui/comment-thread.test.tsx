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

  it("shows the author's name, a time element and the body for each comment", () => {
    render(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={otherId}
        {...actions()}
      />
    );
    expect(screen.getByText("Author")).toBeInTheDocument();
    const time = document.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute(
      "dateTime",
      comments[0]!.createdAt.toISOString()
    );
  });

  it("uses the 'Add a comment…' placeholder on the composer", () => {
    render(
      <CommentThread
        postId={postId}
        comments={comments}
        currentUserId={otherId}
        {...actions()}
      />
    );
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^comment$/i }));
    expect(a.onAddComment).toHaveBeenCalledWith(postId, {
      body: "Nice post!",
    });
    expect(screen.getByLabelText(/add a comment/i)).toHaveValue("");
  });

  it("pages in older comments by cursor, skips ones it already shows, and drops a deleted older one", async () => {
    const older = (n: number) => ({
      ...comments[0]!,
      id: `55555555-5555-4555-8555-55555555555${n}`,
      authorId: otherId,
      body: `older ${n}`,
      createdAt: new Date(2025, 0, n).toISOString(),
      author: { ...comments[0]!.author, id: otherId },
    });
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            // The first row repeats page one's last comment (pushed down by a newer one): shown once.
            comments: [
              { ...comments[0]!, createdAt: "2026-01-01T00:00:00Z" },
              older(1),
              { ...older(2), authorId: otherId },
            ],
            nextCursor: null,
          })
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const a = actions();
    render(
      <CommentThread
        postId={postId}
        comments={comments}
        nextCursor="CUR"
        currentUserId={otherId}
        {...a}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Load more comments" })
    );
    expect(await screen.findByText("older 2")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `/api/v1/posts/${postId}/comments?cursor=CUR`
    );
    expect(screen.getAllByText("bold")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Load more comments" })
    ).toBeNull();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Delete comment" })[0]!
    );
    expect(a.onDeleteComment).toHaveBeenCalledWith(older(1).id);
    await vi.waitFor(() => expect(screen.queryByText("older 1")).toBeNull());
    vi.unstubAllGlobals();
  });
});
