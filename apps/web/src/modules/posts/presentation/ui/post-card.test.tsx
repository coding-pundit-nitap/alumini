import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { PostCard } from "./post-card";

const authorId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";

const post = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId,
  chapterId: null,
  content: "**Hello** <script>alert(1)</script> world",
  imageUrls: ["55555555-5555-4555-8555-555555555555"],
  linkUrl: "https://example.test",
  postType: "TEXT" as const,
  deleted: false,
  createdAt: new Date("2026-01-01"),
};

function actions(over: Record<string, unknown> = {}) {
  return {
    onDelete: vi.fn(async () => ({ ok: true as const, data: {} })),
    onReact: vi.fn(async () => ({ ok: true as const, data: {} })),
    onUnreact: vi.fn(async () => ({ ok: true as const, data: {} })),
    onReport: vi.fn(async () => ({
      ok: true as const,
      data: { reportId: "r1", created: true },
    })),
    onResolve: vi.fn(async () => ({ ok: true as const, data: {} })),
    onDismiss: vi.fn(async () => ({ ok: true as const, data: {} })),
    ...over,
  };
}

describe("PostCard", () => {
  it("renders content through MarkdownView, never as raw HTML", () => {
    render(
      <PostCard
        post={post}
        currentUserId={otherId}
        canModerate={false}
        mine={null}
        {...actions()}
      />
    );
    expect(screen.getByText("Hello").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });

  it("links to the post's comment page", () => {
    render(
      <PostCard
        post={post}
        currentUserId={otherId}
        canModerate={false}
        mine={null}
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: /comments/i })).toHaveAttribute(
      "href",
      `/feed/${post.id}`
    );
  });

  it("shows a delete affordance only to the post's author", () => {
    const { rerender } = render(
      <PostCard
        post={post}
        currentUserId={otherId}
        canModerate={false}
        mine={null}
        {...actions()}
      />
    );
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();

    rerender(
      <PostCard
        post={post}
        currentUserId={authorId}
        canModerate={false}
        mine={null}
        {...actions()}
      />
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls onDelete with the post id", async () => {
    const a = actions();
    render(
      <PostCard
        post={post}
        currentUserId={authorId}
        canModerate={false}
        mine={null}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(a.onDelete).toHaveBeenCalledWith(post.id);
  });

  it("hides the report affordance from a non-moderating actor", () => {
    render(
      <PostCard
        post={post}
        currentUserId={otherId}
        canModerate={false}
        mine={null}
        {...actions()}
      />
    );
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });

  it("shows Report to an actor holding post.moderate or report.review, then Resolve/Dismiss once filed", async () => {
    const a = actions();
    render(
      <PostCard
        post={post}
        currentUserId={otherId}
        canModerate={true}
        mine={null}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^report$/i }));
    await user.type(screen.getByLabelText(/reason/i), "Spam");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(a.onReport).toHaveBeenCalledWith({
      targetType: "POST",
      targetId: post.id,
      reason: "Spam",
    });
    expect(
      await screen.findByRole("button", { name: /resolve/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dismiss/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resolve/i }));
    expect(a.onResolve).toHaveBeenCalledWith("r1");
  });
});
