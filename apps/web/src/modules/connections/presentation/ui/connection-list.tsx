"use client";

import {
  Ban,
  Inbox,
  Loader2,
  MessageCircle,
  Send,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { TickedAvatar } from "@nitap/ui/components/role-tick";

import type { ActionResult } from "@/lib/action-result";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import type { ListedConnection } from "../../application/connection-store";
import { useConnectionAction } from "./use-connection-action";

type Act = Promise<ActionResult<unknown>>;
type MessageAction = (
  userId: string
) => Promise<ActionResult<{ conversationId: string }>>;

export type ConnectionTab = "connections" | "incoming" | "outgoing" | "blocked";

const EMPTY: Record<
  ConnectionTab,
  { text: string; icon: LucideIcon; cta: boolean }
> = {
  connections: {
    text: "You have no connections yet. Find people in the directory.",
    icon: UsersRound,
    cta: true,
  },
  incoming: { text: "No requests waiting for you.", icon: Inbox, cta: true },
  outgoing: { text: "You have no pending requests.", icon: Send, cta: false },
  blocked: { text: "You have not blocked anyone.", icon: Ban, cta: false },
};

/** A line of context under the name, from the connection's dates. */
function context(item: ListedConnection, tab: ConnectionTab) {
  const since = relativeTime(item.respondedAt ?? item.requestedAt);
  switch (tab) {
    case "connections":
      return `Connected · ${since}`;
    case "incoming":
      return `Wants to connect · ${relativeTime(item.requestedAt)}`;
    case "outgoing":
      return `Request sent · ${relativeTime(item.requestedAt)}`;
    case "blocked":
      return `Blocked · ${since}`;
  }
}

const PILL = "rounded-full";

/** Opens (or starts) the 1:1 with this member. Its own component: only it needs the router. */
function MessageControl({
  userId,
  action,
  onError,
}: {
  userId: string;
  action: MessageAction;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className={PILL}
      disabled={opening}
      onClick={() => {
        onError(null);
        startOpening(async () => {
          const result = await action(userId);
          if (result.ok) router.push(`/messages/${result.data.conversationId}`);
          else onError(result.error.message);
        });
      }}
    >
      <MessageCircle aria-hidden />
      <span className="sr-only sm:not-sr-only">Message</span>
    </Button>
  );
}

function Row({
  item,
  tab,
  respondAction,
  removeAction,
  messageAction,
}: {
  item: ListedConnection;
  tab: ConnectionTab;
  respondAction: (connectionId: string, decision: "ACCEPT" | "REJECT") => Act;
  removeAction: (connectionId: string) => Act;
  messageAction?: MessageAction;
}) {
  const { pending, error, run } = useConnectionAction();
  const [messageError, setMessageError] = useState<string | null>(null);
  // The row leaves as soon as it is acted on; the action's refresh then drops it from the list for good.
  // A failure brings it back with the message (adjusted during render, not in an effect).
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error) {
      setLeaving(false);
      setGone(false);
    }
  }

  function act(action: () => Act) {
    setLeaving(true);
    run(action);
  }

  if (gone) return null;

  return (
    <li
      onAnimationEnd={() => {
        if (leaving) setGone(true);
      }}
      className={cn(
        "px-4 py-3.5 sm:px-5",
        leaving
          ? "animate-out fade-out slide-out-to-right-4 fill-mode-forwards pointer-events-none duration-200"
          : "hover:bg-muted/30 transition-colors"
      )}
    >
      <div className="flex items-center gap-3">
        <TickedAvatar tick={item.user.tick}>
          <InitialsAvatar
            name={item.user.fullName}
            seed={item.user.id}
            src={item.user.hasPhoto ? `/api/photos/${item.user.id}` : null}
            size="lg"
            className="size-11"
          />
        </TickedAvatar>
        <div className="min-w-0 flex-1">
          {tab === "blocked" ? (
            <span className="block truncate font-medium">
              {item.user.fullName}
            </span>
          ) : (
            <Link
              href={`/members/${item.user.id}`}
              className="block truncate font-medium underline-offset-2 hover:underline"
            >
              {item.user.fullName}
            </Link>
          )}
          <p
            className="text-muted-foreground truncate text-xs"
            suppressHydrationWarning
          >
            {context(item, tab)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {tab === "incoming" ? (
            <>
              <Button
                size="sm"
                variant="brand"
                className={PILL}
                disabled={pending}
                onClick={() => act(() => respondAction(item.id, "ACCEPT"))}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={PILL}
                disabled={pending}
                onClick={() => act(() => respondAction(item.id, "REJECT"))}
              >
                Decline
              </Button>
            </>
          ) : tab === "connections" ? (
            <>
              {messageAction ? (
                <MessageControl
                  userId={item.user.id}
                  action={messageAction}
                  onError={setMessageError}
                />
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  PILL,
                  "text-muted-foreground hover:text-destructive"
                )}
                disabled={pending}
                onClick={() => act(() => removeAction(item.id))}
              >
                Remove
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant={tab === "blocked" ? "outline" : "ghost"}
              className={cn(
                PILL,
                tab === "outgoing" && "text-muted-foreground"
              )}
              disabled={pending}
              onClick={() => act(() => removeAction(item.id))}
            >
              {tab === "outgoing" ? "Cancel request" : "Unblock"}
            </Button>
          )}
        </div>
      </div>
      {error || messageError ? (
        <p role="alert" className="text-destructive mt-2 pl-14 text-sm">
          {error ?? messageError}
        </p>
      ) : null}
    </li>
  );
}

type WireConnection = Omit<ListedConnection, "requestedAt" | "respondedAt"> & {
  requestedAt: string;
  respondedAt: string | null;
};

/**
 * The server renders the first page; later pages load from `GET /api/v1/connections`. `messageAction`
 * is passed in because this module does not depend on messaging.
 */
export function ConnectionList({
  items,
  tab,
  respondAction,
  removeAction,
  messageAction,
  query,
  nextCursor: firstCursor = null,
  nextHref = null,
}: {
  items: ListedConnection[];
  tab: ConnectionTab;
  respondAction: (connectionId: string, decision: "ACCEPT" | "REJECT") => Act;
  removeAction: (connectionId: string) => Act;
  messageAction?: MessageAction;
  query?: { state: string; direction?: string };
  nextCursor?: string | null;
  nextHref?: string | null;
}) {
  const [more, setMore] = useState<ListedConnection[]>([]);
  const [cursor, setCursor] = useState(firstCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || !query || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ ...query, cursor });
      const res = await fetch(`/api/v1/connections?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as {
        data: WireConnection[];
        page: { nextCursor: string | null };
      };
      setMore((previous) => [
        ...previous,
        ...page.data.map((c) => ({
          ...c,
          requestedAt: new Date(c.requestedAt),
          respondedAt: c.respondedAt ? new Date(c.respondedAt) : null,
        })),
      ]);
      setCursor(page.page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, query]);

  useEffect(() => {
    const el = moreRef.current;
    if (!el || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, failed]);

  const seen = new Set<string>();
  const all = [...items, ...more].filter(
    (c) => !seen.has(c.id) && seen.add(c.id)
  );

  if (all.length === 0) {
    const { text, icon: Icon, cta } = EMPTY[tab];
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">{text}</p>
        {cta ? (
          <Link
            href="/directory"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            Browse the directory
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-border divide-y">
        {all.map((item) => (
          <Row
            key={item.id}
            item={item}
            tab={tab}
            respondAction={respondAction}
            removeAction={removeAction}
            messageAction={messageAction}
          />
        ))}
      </ul>
      {cursor ? (
        <div
          ref={moreRef}
          className="flex flex-col items-center gap-1 border-t py-4"
        >
          {loading ? (
            <Loader2
              aria-label="Loading more"
              className="text-muted-foreground size-5 animate-spin"
            />
          ) : query ? (
            <>
              {failed ? (
                <p className="text-muted-foreground text-xs">
                  Couldn&apos;t load more.
                </p>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground rounded-full"
                onClick={() => void loadMore()}
              >
                {failed ? "Try again" : "Load more"}
              </Button>
            </>
          ) : nextHref ? (
            <Link
              href={nextHref}
              className="text-muted-foreground text-sm underline"
            >
              Next page
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
