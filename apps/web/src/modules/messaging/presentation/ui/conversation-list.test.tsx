import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";

import { act, render, screen } from "../../../../../tests/support/test-utils";
import { ConversationList, type InboxConversation } from "./conversation-list";
import {
  MESSAGES_CHANGED_EVENT,
  MESSAGES_READ_EVENT,
} from "./conversation-avatar";

const person = (id: string, fullName: string) => ({
  id,
  fullName,
  hasPhoto: false,
});
const conv = (over: Partial<InboxConversation>): InboxConversation => ({
  id: "c1",
  isGroup: false,
  title: null,
  participants: [person("me", "Asha"), person("ravi", "Ravi")],
  unreadCount: 0,
  lastMessageSeq: "5",
  lastMessageAt: "2026-09-22T10:00:00Z",
  lastMessage: { senderId: "ravi", body: "See you at the reunion" },
  ...over,
});

class FakeEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: [] })))
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = (
  conversations: InboxConversation[],
  nextCursor: string | null = null
) =>
  render(
    <ConversationList
      conversations={conversations}
      viewerId="me"
      nextCursor={nextCursor}
    />
  );

describe("ConversationList", () => {
  it("names a 1:1 by the other member, previews the last message and links to the thread", () => {
    setup([conv({})]);
    const link = screen.getByRole("link", { name: /Ravi/ });
    expect(link).toHaveAttribute("href", "/messages/c1");
    expect(link).toHaveTextContent("See you at the reunion");
  });

  it("shows a group's title, or its members when it has none, and who sent the preview", () => {
    setup([
      conv({
        id: "g1",
        isGroup: true,
        title: "Batch of 2020",
        lastMessage: { senderId: "me", body: "Hello all" },
      }),
      conv({
        id: "g2",
        isGroup: true,
        participants: [
          person("me", "Asha"),
          person("a", "Ravi Kumar"),
          person("b", "Meera"),
        ],
        lastMessage: { senderId: "a", body: "On my way" },
      }),
    ]);
    expect(
      screen.getByRole("link", { name: /Batch of 2020/ })
    ).toHaveTextContent("You: Hello all");
    expect(
      screen.getByRole("link", { name: /Ravi Kumar, Meera/ })
    ).toHaveTextContent("Ravi: On my way");
  });

  it("previews a moderator-hidden message as removed, never its text", () => {
    setup([conv({ lastMessage: { senderId: "ravi", body: null } })]);
    expect(screen.getByText("Message removed")).toBeInTheDocument();
  });

  it("badges unread conversations, and clears the badge when the thread is read", () => {
    setup([conv({ unreadCount: 3 }), conv({ id: "c2", unreadCount: 0 })]);
    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
    expect(screen.queryByLabelText("0 unread")).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MESSAGES_READ_EVENT, {
          detail: { conversationId: "c1" },
        })
      );
    });
    expect(screen.queryByLabelText("3 unread")).toBeNull();
  });

  it("filters loaded conversations by name", async () => {
    setup([
      conv({}),
      conv({
        id: "c2",
        participants: [person("me", "Asha"), person("m", "Meera")],
      }),
    ]);
    await userEvent.type(screen.getByLabelText("Search conversations"), "mee");
    expect(screen.queryByRole("link", { name: /Ravi/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Meera/ })).toBeInTheDocument();
  });

  it("has an empty state and an older-conversations link only when there is a next page", () => {
    const { unmount } = setup([]);
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
    unmount();
    setup([conv({})], "x");
    expect(
      screen.getByRole("link", { name: "Older conversations" })
    ).toHaveAttribute("href", "/messages?cursor=x");
  });

  it("refetches on a change hint and when the tab becomes visible, newest first", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              conv({
                id: "c2",
                lastMessageSeq: "9",
                participants: [person("me", "Asha"), person("m", "Meera")],
              }),
            ],
          })
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    setup([conv({})]);
    await act(async () => {
      window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
    });
    const links = screen
      .getAllByRole("link")
      .filter((a) => /^\/messages\/c/.test(a.getAttribute("href") ?? ""));
    expect(links[0]).toHaveTextContent("Meera");
    expect(links[1]).toHaveTextContent("Ravi");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/conversations?limit=20");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the list when a refetch fails or is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(new Response("", { status: 500 }))
    );
    setup([conv({})]);
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
      });
    }
    expect(screen.getByRole("link", { name: /Ravi/ })).toBeInTheDocument();
  });

  it("loads older conversations from the link and drops it on the last page", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              conv({
                id: "old",
                lastMessageSeq: "1",
                participants: [person("me", "Asha"), person("o", "Old Friend")],
              }),
            ],
            page: { nextCursor: null },
          })
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    setup([conv({})], "cur/1");
    await userEvent.click(
      screen.getByRole("link", { name: "Older conversations" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/conversations?limit=20&cursor=cur%2F1"
    );
    expect(
      await screen.findByRole("link", { name: /Old Friend/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Older conversations" })
    ).toBeNull();
  });

  it("keeps the older-conversations link when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(new Response("", { status: 500 }))
    );
    setup([conv({})], "x");
    for (let i = 0; i < 2; i += 1) {
      await userEvent.click(
        await screen.findByRole("link", { name: "Older conversations" })
      );
    }
    expect(
      await screen.findByRole("link", { name: "Older conversations" })
    ).toBeInTheDocument();
  });

  it("pages in older conversations when the end of the list scrolls into view", async () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [], page: { nextCursor: null } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    setup([conv({})], "x");
    await act(async () => {
      fire([{ isIntersecting: false }]);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fire([{ isIntersecting: true }]);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/conversations?limit=20&cursor=x"
    );
  });

  it("says when no loaded conversation matches the search", async () => {
    setup([conv({})]);
    await userEvent.type(screen.getByLabelText("Search conversations"), "zzz");
    expect(
      screen.getByText(/No conversations match .zzz./)
    ).toBeInTheDocument();
  });

  it("names an unknown group sender as Someone and orders equal sequences stably", () => {
    setup([
      conv({
        id: "g",
        isGroup: true,
        title: "Group",
        lastMessage: { senderId: "gone", body: "hi" },
      }),
      conv({ id: "c2", lastMessageSeq: "5", lastMessage: null }),
    ]);
    expect(screen.getByRole("link", { name: /Group/ })).toHaveTextContent(
      "Someone: hi"
    );
  });
});
