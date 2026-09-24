import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";

import { act, render, screen } from "../../../../../tests/support/test-utils";
import { ConversationList, type InboxConversation } from "./conversation-list";
import { MESSAGES_READ_EVENT } from "./conversation-avatar";

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
});
