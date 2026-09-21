import Link from "next/link";

import type { ListedConversation } from "../../application/messaging-store";

/** The inbox: newest activity first. A 1:1 is named for the other member; a group by its title or its members. */
export function ConversationList({
  conversations,
  viewerId,
  nextHref,
}: {
  conversations: ListedConversation[];
  viewerId: string;
  nextHref: string | null;
}) {
  if (conversations.length === 0) {
    return <p className="text-muted-foreground">No conversations yet.</p>;
  }
  const label = (c: ListedConversation) =>
    c.title ??
    (c.participants
      .filter((p) => p.id !== viewerId)
      .map((p) => p.fullName)
      .join(", ") ||
      "Conversation");

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {conversations.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-3">
            <Link
              href={`/messages/${c.id}`}
              className="font-medium hover:underline"
            >
              {label(c)}
            </Link>
            <span className="text-muted-foreground flex items-center gap-3 text-xs">
              {c.lastMessageAt ? (
                <time dateTime={c.lastMessageAt.toISOString()}>
                  {c.lastMessageAt.toLocaleDateString()}
                </time>
              ) : null}
              {c.unreadCount > 0 ? (
                <span
                  aria-label={`${c.unreadCount} unread`}
                  className="bg-primary text-primary-foreground rounded-full px-2 py-0.5"
                >
                  {c.unreadCount}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {nextHref ? (
        <Link href={nextHref} className="text-primary text-sm underline">
          Older conversations
        </Link>
      ) : null}
    </div>
  );
}
