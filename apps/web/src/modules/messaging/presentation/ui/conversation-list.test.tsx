import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import type { ListedConversation } from "../../application/messaging-store";
import { ConversationList } from "./conversation-list";

const person = (id: string, fullName: string) => ({
  id,
  fullName,
  hasPhoto: false,
});
const conv = (over: Partial<ListedConversation>): ListedConversation => ({
  id: "c1",
  isGroup: false,
  title: null,
  participants: [person("me", "Asha"), person("ravi", "Ravi")],
  unreadCount: 0,
  lastMessageSeq: "5",
  lastMessageAt: new Date("2026-09-22T10:00:00Z"),
  ...over,
});

describe("ConversationList", () => {
  it("names a 1:1 by the other member and links to the thread", () => {
    render(
      <ConversationList
        conversations={[conv({})]}
        viewerId="me"
        nextHref={null}
      />
    );
    expect(screen.getByRole("link", { name: /Ravi/ })).toHaveAttribute(
      "href",
      "/messages/c1"
    );
  });

  it("shows a group's title, or its members when it has none", () => {
    render(
      <ConversationList
        viewerId="me"
        nextHref={null}
        conversations={[
          conv({ id: "g1", isGroup: true, title: "Batch of 2020" }),
          conv({
            id: "g2",
            isGroup: true,
            participants: [
              person("me", "Asha"),
              person("a", "Ravi"),
              person("b", "Meera"),
            ],
          }),
        ]}
      />
    );
    expect(
      screen.getByRole("link", { name: /Batch of 2020/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ravi, Meera/ })
    ).toBeInTheDocument();
  });

  it("badges unread conversations and says nothing for read ones", () => {
    render(
      <ConversationList
        conversations={[conv({ unreadCount: 3 })]}
        viewerId="me"
        nextHref={null}
      />
    );
    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
    render(
      <ConversationList
        conversations={[conv({ id: "c2", unreadCount: 0 })]}
        viewerId="me"
        nextHref={null}
      />
    );
    expect(screen.queryByLabelText("0 unread")).toBeNull();
  });

  it("has an empty state and an older-conversations link only when there is a next page", () => {
    const { rerender } = render(
      <ConversationList conversations={[]} viewerId="me" nextHref={null} />
    );
    expect(screen.getByText("No conversations yet.")).toBeInTheDocument();
    rerender(
      <ConversationList
        conversations={[conv({})]}
        viewerId="me"
        nextHref="/messages?cursor=x"
      />
    );
    expect(
      screen.getByRole("link", { name: "Older conversations" })
    ).toHaveAttribute("href", "/messages?cursor=x");
  });
});
