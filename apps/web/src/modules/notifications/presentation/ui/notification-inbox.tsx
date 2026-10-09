"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@nitap/ui/components/button";

import { NotificationList, type NotificationItem } from "./notification-list";

const JSON_HEADERS = { "content-type": "application/json" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/** Owns mark-read and load-more state. Mutations are optimistic and roll back on failure. */
export function NotificationInbox({
  initialItems,
  initialNextCursor,
}: {
  initialItems: NotificationItem[];
  initialNextCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRead = async (id: string) => {
    setError(null);
    // Revert only this item's own prior value on failure: another item's mark-read may resolve
    // while this one is still in flight, and its success must survive a whole-array rollback.
    const previousReadAt = items.find((item) => item.id === id)?.readAt ?? null;
    const revert = () =>
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, readAt: previousReadAt } : item
        )
      );
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
    try {
      const response = await fetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        headers: JSON_HEADERS,
      });
      if (!response.ok) {
        revert();
        setError(
          await errorMessage(
            response,
            "Could not mark as read. Please try again."
          )
        );
      }
    } catch {
      revert();
      setError("Could not mark as read. Check your connection and try again.");
    }
  };

  const [markingAll, setMarkingAll] = useState(false);
  const onReadAll = async () => {
    setError(null);
    setMarkingAll(true);
    // Only the ones this call flips go back on failure; anything marked meanwhile stays read.
    const flipped = new Set(
      items.filter((item) => !item.readAt).map((item) => item.id)
    );
    const now = new Date().toISOString();
    const revert = () =>
      setItems((current) =>
        current.map((item) =>
          flipped.has(item.id) ? { ...item, readAt: null } : item
        )
      );
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt: now }))
    );
    try {
      const response = await fetch("/api/v1/notifications/read-all", {
        method: "POST",
        headers: JSON_HEADERS,
      });
      if (!response.ok) {
        revert();
        setError(
          await errorMessage(
            response,
            "Could not mark all as read. Please try again."
          )
        );
      }
    } catch {
      revert();
      setError(
        "Could not mark all as read. Check your connection and try again."
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const [failed, setFailed] = useState(false);
  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setError(null);
    setFailed(false);
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`
      );
      if (!response.ok) {
        setFailed(true);
        setError(
          await errorMessage(
            response,
            "Could not load more notifications. Please try again."
          )
        );
        return;
      }
      const body = (await response.json()) as {
        data: NotificationItem[];
        page: { nextCursor: string | null };
      };
      setItems((current) => [...current, ...body.data]);
      setCursor(body.page.nextCursor);
    } catch {
      setFailed(true);
      setError(
        "Could not load more notifications. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  // Scrolling near the end loads the next page; the button stays for keyboards and as the retry.
  // A failed page stops auto-loading, so it can't retry in a loop.
  const moreRef = useRef<HTMLDivElement>(null);
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

  const unread = items.some((item) => !item.readAt);

  return (
    <div>
      {unread || error ? (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b px-4 py-2 sm:px-5">
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : (
            <span />
          )}
          {unread ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0 rounded-full"
              disabled={markingAll}
              onClick={() => void onReadAll()}
            >
              <CheckCheck aria-hidden />
              Mark all read
            </Button>
          ) : null}
        </div>
      ) : null}
      <NotificationList items={items} onRead={(id) => void onRead(id)} />
      {cursor ? (
        <div ref={moreRef} className="flex justify-center py-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-full"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {loading ? (
              <>
                <Loader2 aria-hidden className="animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
