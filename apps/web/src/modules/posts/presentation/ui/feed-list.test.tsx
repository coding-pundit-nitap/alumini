import { describe, expect, it, vi } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { FeedList } from "./feed-list";

const noReactions = { LIKE: 0, CELEBRATE: 0, SUPPORT: 0, INSIGHTFUL: 0 };

const posts = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    authorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    chapterId: null,
    content: "Newest **post**",
    imageUrls: [],
    linkUrl: null,
    postType: "TEXT" as const,
    deleted: false,
    createdAt: new Date("2026-01-02"),
    author: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fullName: "Author One",
      headline: null,
      hasPhoto: false,
    },
    reactionCounts: noReactions,
    commentCount: 0,
    myReaction: null,
    openReportId: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    authorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    chapterId: null,
    content: "Older <script>alert(1)</script> post",
    imageUrls: [],
    linkUrl: null,
    postType: "TEXT" as const,
    deleted: false,
    createdAt: new Date("2026-01-01"),
    author: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fullName: "Author Two",
      headline: null,
      hasPhoto: false,
    },
    reactionCounts: noReactions,
    commentCount: 0,
    myReaction: null,
    openReportId: null,
  },
];

function actions() {
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
  };
}

describe("FeedList", () => {
  it("renders posts newest-first with Markdown-rendered content and no raw HTML", () => {
    render(
      <FeedList
        posts={posts}
        nextCursor={null}
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );
    const strongEls = screen.getAllByText(/post$/, { selector: "strong" });
    expect(strongEls[0]).toHaveTextContent("post");
    expect(document.querySelector("script")).toBeNull();

    const paragraphs = document.querySelectorAll("article");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toMatch(/Newest/);
    expect(paragraphs[1]?.textContent).toMatch(/Older/);
  });

  it("renders a load-more link carrying the next cursor when one is given", () => {
    render(
      <FeedList
        posts={posts}
        nextCursor="abc123"
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.getByRole("link", { name: /load more/i })).toHaveAttribute(
      "href",
      "/feed?cursor=abc123"
    );
  });

  it("renders no load-more link when there is no next cursor", () => {
    render(
      <FeedList
        posts={posts}
        nextCursor={null}
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );
    expect(screen.queryByRole("link", { name: /load more/i })).toBeNull();
  });
});
