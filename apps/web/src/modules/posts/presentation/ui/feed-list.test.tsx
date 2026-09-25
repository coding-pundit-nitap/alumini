import { describe, expect, it, vi } from "vitest";

import {
  render,
  screen,
  waitFor,
} from "../../../../../tests/support/test-utils";
import { FeedList } from "./feed-list";

const noReactions = { LIKE: 0, CELEBRATE: 0, SUPPORT: 0, INSIGHTFUL: 0 };

function makePost(id: string, content: string, createdAt: string) {
  return {
    id,
    authorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    chapterId: null,
    content,
    title: null,
    imageUrls: [],
    linkUrl: null,
    postType: "TEXT" as const,
    deleted: false,
    createdAt: new Date(createdAt),
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
  };
}

const posts = [
  makePost(
    "11111111-1111-4111-8111-111111111111",
    "Newest **post**",
    "2026-01-02"
  ),
  makePost(
    "22222222-2222-4222-8222-222222222222",
    "Older <script>alert(1)</script> post",
    "2026-01-01"
  ),
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
  it("shows the pinned announcement first and not again in the list", () => {
    const pinned = {
      ...makePost("99999999-9999-4999-8999-999999999999", "Body", "2026-01-03"),
      postType: "ANNOUNCEMENT" as const,
      title: "Pinned one",
    };
    render(
      <FeedList
        posts={[pinned, ...posts]}
        nextCursor={null}
        currentUserId={null}
        canModerate={false}
        pinned={pinned}
        {...actions()}
      />
    );
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Pinned one" })).toHaveLength(
      1
    );
  });

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

    const articles = document.querySelectorAll("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]?.textContent).toMatch(/Newest/);
    expect(articles[1]?.textContent).toMatch(/Older/);
  });

  it("shows an intentional empty state when there are no posts", () => {
    render(
      <FeedList
        posts={[]}
        nextCursor={null}
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );
    expect(
      screen.getByText("No posts yet — be the first to share something.")
    ).toBeInTheDocument();
  });

  it("fetches the next page and appends it after page 1, then hides Load more once nextCursor is null", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [
          {
            ...makePost(
              "33333333-3333-4333-8333-333333333333",
              "Page two post",
              "2025-12-31"
            ),
            createdAt: "2025-12-31T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    } as Response);

    render(
      <FeedList
        posts={posts}
        nextCursor="abc123"
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );

    const loadMore = screen.getByRole("link", { name: /load more/i });
    expect(loadMore).toHaveAttribute("href", "/dashboard?cursor=abc123");

    await user.click(loadMore);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/posts?cursor=abc123",
      expect.anything()
    );

    await waitFor(() => {
      expect(screen.getByText("Page two post")).toBeInTheDocument();
    });

    const articles = document.querySelectorAll("article");
    expect(articles).toHaveLength(3);
    expect(articles[2]?.textContent).toMatch(/Page two post/);

    expect(
      screen.queryByRole("link", { name: /load more/i })
    ).not.toBeInTheDocument();
  });

  it("shows a retry affordance when loading the next page fails", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ message: "boom" }),
    } as Response);

    render(
      <FeedList
        posts={posts}
        nextCursor="abc123"
        currentUserId={null}
        canModerate={false}
        {...actions()}
      />
    );

    await user.click(screen.getByRole("link", { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't load more posts.")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });
});
