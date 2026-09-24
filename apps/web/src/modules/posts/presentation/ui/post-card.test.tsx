import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { FeedPost } from "../../application/posts-store";
import { PostCard } from "./post-card";

const authorId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const postId = "11111111-1111-4111-8111-111111111111";

const basePost: FeedPost = {
  id: postId,
  authorId,
  chapterId: null,
  content: "**Hello** <script>alert(1)</script> world",
  imageUrls: [],
  linkUrl: null,
  postType: "TEXT",
  deleted: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  author: {
    id: authorId,
    fullName: "Ada Lovelace",
    headline: "Engineer",
    hasPhoto: false,
  },
  reactionCounts: { LIKE: 0, CELEBRATE: 0, SUPPORT: 0, INSIGHTFUL: 0 },
  commentCount: 0,
  myReaction: null,
  openReportId: null,
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
  it("renders the author name and a time element, and never renders raw HTML", () => {
    render(
      <PostCard
        post={basePost}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(document.querySelector("time")).not.toBeNull();
    expect(screen.getByText("Hello").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows an Achievement badge for an ACHIEVEMENT post", () => {
    render(
      <PostCard
        post={{ ...basePost, postType: "ACHIEVEMENT" }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByText("Achievement")).toBeInTheDocument();
  });

  it("renders one img per attached image, served through /api/uploads/{id}", () => {
    const imageUrls = ["a1", "a2", "a3"];
    render(
      <PostCard
        post={{ ...basePost, imageUrls }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    const imgs = screen
      .getAllByRole("img")
      .filter((el) => el.tagName === "IMG");
    expect(imgs).toHaveLength(3);
    imgs.forEach((img, i) => {
      expect(img).toHaveAttribute("src", `/api/uploads/${imageUrls[i]}`);
    });
  });

  it("shows the hostname for a link post", () => {
    render(
      <PostCard
        post={{ ...basePost, linkUrl: "https://example.test/path/to/page" }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByText("example.test")).toBeInTheDocument();
  });

  it("labels the comments link by count and links to /feed/{id}", () => {
    const { rerender } = render(
      <PostCard
        post={{ ...basePost, commentCount: 0 }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: "Comment" })).toHaveAttribute(
      "href",
      `/feed/${postId}`
    );

    rerender(
      <PostCard
        post={{ ...basePost, commentCount: 1 }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: "1 comment" })).toBeInTheDocument();

    rerender(
      <PostCard
        post={{ ...basePost, commentCount: 5 }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(
      screen.getByRole("link", { name: "5 comments" })
    ).toBeInTheDocument();
  });

  it("lets the author delete the post, removing it from view on success", async () => {
    const a = actions();
    render(
      <PostCard
        post={basePost}
        currentUserId={authorId}
        canModerate={false}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /post options/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(a.onDelete).toHaveBeenCalledWith(postId);
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });

  it("keeps the post and shows an error when delete fails", async () => {
    const a = actions({
      onDelete: vi.fn(async () => ({
        ok: false as const,
        error: { code: "X", message: "Could not delete." },
        requestId: "q",
      })),
    });
    render(
      <PostCard
        post={basePost}
        currentUserId={authorId}
        canModerate={false}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /post options/i }));
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete.")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("hides Delete and Report, and renders no options menu, for a non-owner non-moderator", () => {
    render(
      <PostCard
        post={basePost}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.queryByRole("button", { name: /post options/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^report$/i })).toBeNull();
  });

  it("shows Resolve/Dismiss for a moderator when the post has an open report", () => {
    render(
      <PostCard
        post={{ ...basePost, openReportId: "r1" }}
        currentUserId={otherId}
        canModerate={true}
        {...actions()}
      />
    );
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  describe("share", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn(async () => undefined) },
        configurable: true,
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("copies the post link and confirms it", async () => {
      render(
        <PostCard
          post={basePost}
          currentUserId={otherId}
          canModerate={false}
          {...actions()}
        />
      );
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: /copy link to post/i })
      );
      expect(await screen.findByText("Link copied")).toBeInTheDocument();
    });
  });

  it("ships '…more' in the server HTML for an obviously long post, so it doesn't pop in after load", () => {
    const html = (content: string) =>
      renderToString(
        <PostCard
          post={{ ...basePost, content }}
          currentUserId={otherId}
          canModerate={false}
          {...actions()}
        />
      );
    expect(html("x ".repeat(400))).toContain("…more");
    expect(
      html(Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n\n"))
    ).toContain("…more");
    expect(html("A short post.")).not.toContain("…more");
  });

  it("on the post's own page, points the comment action at the comment box instead of itself", () => {
    render(
      <PostCard
        post={{ ...basePost, commentCount: 2 }}
        currentUserId={otherId}
        canModerate={false}
        expanded
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: "2 comments" })).toHaveAttribute(
      "href",
      "#add-comment"
    );
  });
});
