import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fireEvent,
  render,
  screen,
} from "../../../../../tests/support/test-utils";
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
  title: null,
  imageUrls: [],
  linkUrl: null,
  postType: "TEXT",
  deleted: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  editedAt: null,
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
    onEdit: vi.fn(async () => ({ ok: true as const, data: {} })),
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

  it("renders an announcement with its badge and title as a heading", () => {
    render(
      <PostCard
        post={{
          ...basePost,
          postType: "ANNOUNCEMENT",
          title: "Convocation 2026",
        }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByText("Announcement")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Convocation 2026" })
    ).toBeInTheDocument();
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

  it("lets the author edit a TEXT post in place, then marks it edited", async () => {
    const a = actions();
    render(
      <PostCard
        post={{ ...basePost, content: "First draft" }}
        currentUserId={authorId}
        canModerate={false}
        {...a}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /post options/i }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Edit post" });
    expect(box).toHaveValue("First draft");
    await user.clear(box);
    await user.type(box, "  Second draft  ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(a.onEdit).toHaveBeenCalledWith(postId, { content: "Second draft" });
    expect(await screen.findByText("Second draft")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Edit post" })).toBeNull();
    expect(screen.getByText("· edited")).toBeInTheDocument();
  });

  it("keeps the editor open with the error when the edit is refused", async () => {
    const a = actions({
      onEdit: vi.fn(async () => ({
        ok: false as const,
        error: { code: "POST_UNDER_REVIEW", message: "Under review." },
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
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Edit post" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Under review.");
    expect(
      screen.getByRole("textbox", { name: "Edit post" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Edit post" })).toBeNull();
    expect(screen.queryByText("· edited")).toBeNull();
  });

  it("offers Edit only on the author's own TEXT post", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <PostCard
        post={{ ...basePost, postType: "ACHIEVEMENT" }}
        currentUserId={authorId}
        canModerate={false}
        {...actions({ onEdit })}
      />
    );
    await user.click(screen.getByRole("button", { name: /post options/i }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: /delete/i })
    ).toBeInTheDocument();
  });

  it("shows the edited marker for a post edited earlier", () => {
    render(
      <PostCard
        post={{ ...basePost, editedAt: new Date("2026-01-02T00:00:00Z") }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByText("· edited")).toBeInTheDocument();
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

  it("saves an edit with Ctrl+Enter, cancels with Escape, and will not save empty text", async () => {
    const a = actions();
    render(
      <PostCard
        post={{ ...basePost, content: "Draft" }}
        currentUserId={authorId}
        canModerate={false}
        {...a}
      />
    );
    const user = userEvent.setup();
    const open = async () => {
      await user.click(screen.getByRole("button", { name: /post options/i }));
      await user.click(screen.getByRole("menuitem", { name: "Edit" }));
      return screen.getByRole("textbox", { name: "Edit post" });
    };
    await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Edit post" })).toBeNull();

    const box = await open();
    await user.clear(box);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(a.onEdit).not.toHaveBeenCalled();
    await user.type(box, "Final");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(a.onEdit).toHaveBeenCalledWith(postId, { content: "Final" });
  });

  it("lays out two images side by side and replaces a broken one", async () => {
    render(
      <PostCard
        post={{ ...basePost, imageUrls: ["i1", "i2"] }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    const imgs = screen
      .getAllByRole("img")
      .filter((el) => el.tagName === "IMG");
    expect(imgs[0]!.parentElement).toHaveClass("grid-cols-2");
    fireEvent.error(imgs[0]!);
    expect(await screen.findByText("Image unavailable")).toBeInTheDocument();
  });

  it("shows a malformed link as typed", () => {
    render(
      <PostCard
        post={{ ...basePost, linkUrl: "not a url" }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: /not a url/ })).toHaveAttribute(
      "href",
      "not a url"
    );
  });

  it("expands a long post with …more", async () => {
    // happy-dom does no layout: make the clamped body measure as overflowing.
    const height = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(500);
    render(
      <PostCard
        post={{ ...basePost, content: "word ".repeat(200) }}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "…more" }));
    expect(screen.queryByRole("button", { name: "…more" })).toBeNull();
    height.mockRestore();
  });

  it("says when the link cannot be copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(
      <PostCard
        post={basePost}
        currentUserId={otherId}
        canModerate={false}
        {...actions()}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy link to post" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Couldn't copy"
    );
  });

  it("on the post's own page, the comment action focuses the comment box", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<form id="add-comment"><textarea></textarea></form>'
    );
    const form = document.getElementById("add-comment")!;
    form.scrollIntoView = vi.fn();
    render(
      <PostCard
        post={basePost}
        currentUserId={otherId}
        canModerate={false}
        expanded
        {...actions()}
      />
    );
    await userEvent.click(screen.getByRole("link", { name: "Comment" }));
    expect(form.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(form.querySelector("textarea"));
    form.remove();
  });
});
