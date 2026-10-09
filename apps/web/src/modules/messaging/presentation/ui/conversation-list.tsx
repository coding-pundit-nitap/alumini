"use client";

import { Loader2, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { subscribeToMessageStream } from "@/lib/message-stream-client";
import { cn } from "@/lib/utils";

import type { ListedConversation } from "../../application/messaging-store";
import {
  ConversationAvatar,
  conversationLabel,
  MESSAGES_CHANGED_EVENT,
  MESSAGES_READ_EVENT,
} from "./conversation-avatar";
import { inboxStamp } from "./format";

/** A listed conversation as JSON carries it: the date is an ISO string. */
export type InboxConversation = Omit<ListedConversation, "lastMessageAt"> & {
  lastMessageAt: string | null;
};

const BACKFILL_MS = 30_000;
const newestFirst = (a: InboxConversation, b: InboxConversation) => {
  const [x, y] = [BigInt(a.lastMessageSeq), BigInt(b.lastMessageSeq)];
  return x > y ? -1 : x < y ? 1 : 0;
};

function preview(c: InboxConversation, viewerId: string) {
  const last = c.lastMessage;
  if (!last) return null;
  const who =
    last.senderId === viewerId
      ? "You: "
      : c.isGroup
        ? `${c.participants.find((p) => p.id === last.senderId)?.fullName.split(/\s+/)[0] ?? "Someone"}: `
        : "";
  return (
    <>
      {who}
      {last.body ?? <span className="italic">Message removed</span>}
    </>
  );
}

/** Kept fresh by the SSE hint, a 30 s poll and tab focus. Older conversations load on scroll. */
export function ConversationList({
  conversations: initial,
  viewerId,
  nextCursor: initialCursor,
}: {
  conversations: InboxConversation[];
  viewerId: string;
  nextCursor: string | null;
}) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState(initial);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const sentinel = useRef<HTMLLIElement>(null);

  const merge = useCallback((incoming: InboxConversation[]) => {
    setConversations((previous) => {
      const byId = new Map(previous.map((c) => [c.id, c]));
      for (const c of incoming) byId.set(c.id, c);
      return [...byId.values()].sort(newestFirst);
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/conversations?limit=20");
      if (res.ok)
        merge(((await res.json()) as { data: InboxConversation[] }).data);
    } catch {
      // offline: the next hint, poll or focus tries again
    }
  }, [merge]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/v1/conversations?limit=20&cursor=${encodeURIComponent(nextCursor)}`
      );
      if (res.ok) {
        const { data, page } = (await res.json()) as {
          data: InboxConversation[];
          page: { nextCursor: string | null };
        };
        merge(data);
        setNextCursor(page.nextCursor);
      }
    } catch {
      // the link stays; scrolling or clicking tries again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, merge, nextCursor]);

  useEffect(() => {
    const unsubscribe = subscribeToMessageStream("message", () => {
      void refresh();
    });
    const poll = setInterval(() => void refresh(), BACKFILL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onRead = (event: Event) => {
      const { conversationId } = (
        event as CustomEvent<{
          conversationId: string;
        }>
      ).detail;
      setConversations((previous) =>
        previous.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c
        )
      );
    };
    const onChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    window.addEventListener(MESSAGES_CHANGED_EVENT, onChanged);
    return () => {
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(MESSAGES_READ_EVENT, onRead);
      window.removeEventListener(MESSAGES_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? conversations.filter((c) =>
        conversationLabel(c, viewerId).toLowerCase().includes(needle)
      )
    : conversations;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
        <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
        <Link
          href="/messages/new-group"
          aria-label="New group"
          title="New group"
          className="hover:bg-muted focus-visible:ring-ring flex size-9 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
        >
          <SquarePen aria-hidden className="size-[18px]" />
        </Link>
      </div>

      {conversations.length > 0 ? (
        <div className="px-3 pb-2">
          <label className="bg-muted/60 focus-within:ring-ring/60 flex h-9 items-center gap-2 rounded-full px-3 focus-within:ring-2">
            <Search aria-hidden className="text-muted-foreground size-4" />
            <span className="sr-only">Search conversations</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
      ) : null}

      {conversations.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          No conversations yet.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 scrollbar-none overflow-y-auto px-2 pb-3">
          {shown.map((c) => {
            const href = `/messages/${c.id}`;
            const active = pathname === href;
            const unread = c.unreadCount > 0;
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150 outline-none focus-visible:ring-2",
                    active ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <ConversationAvatar
                    conversation={c}
                    viewerId={viewerId}
                    isGroup={c.isGroup}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[15px]",
                          unread ? "font-semibold" : "font-medium"
                        )}
                      >
                        {conversationLabel(c, viewerId)}
                      </span>
                      {c.lastMessageAt ? (
                        <time
                          dateTime={c.lastMessageAt}
                          suppressHydrationWarning
                          className={cn(
                            "shrink-0 text-[11px] tabular-nums",
                            unread
                              ? "text-brand font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {inboxStamp(new Date(c.lastMessageAt))}
                        </time>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          unread ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {preview(c, viewerId)}
                      </span>
                      {unread ? (
                        <span
                          aria-label={`${c.unreadCount} unread`}
                          className="bg-brand text-brand-foreground animate-in zoom-in-50 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums duration-200"
                        >
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {needle && shown.length === 0 ? (
            <li className="text-muted-foreground px-3 py-8 text-center text-sm">
              No conversations match &ldquo;{query.trim()}&rdquo;.
            </li>
          ) : null}
          {nextCursor ? (
            <li ref={sentinel} className="flex justify-center py-3">
              {loadingMore ? (
                <Loader2
                  aria-label="Loading older conversations"
                  className="text-muted-foreground size-4 animate-spin"
                />
              ) : (
                <Link
                  href={`/messages?cursor=${encodeURIComponent(nextCursor)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    void loadMore();
                  }}
                  className="text-muted-foreground hover:text-foreground text-xs font-medium"
                >
                  Older conversations
                </Link>
              )}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
