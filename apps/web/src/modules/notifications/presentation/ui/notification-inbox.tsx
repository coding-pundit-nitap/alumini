"use client";

import { useState } from "react";

import { NotificationList, type NotificationItem } from "./notification-list";

const JSON_HEADERS = { "content-type": "application/json" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/**
 * The `/notifications` client shell: owns mark-read and load-more state around the server-rendered first
 * page. `NotificationList` stays a dumb presentational component; this is where the fetches live. Both
 * mutations are optimistic and roll back to the pre-request state on a non-2xx response or a network error,
 * surfacing a short message (mirrors messaging's `Thread`).
 */
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
    const previous = items;
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
        setItems(previous);
        setError(
          await errorMessage(
            response,
            "Could not mark as read. Please try again."
          )
        );
      }
    } catch {
      setItems(previous);
      setError("Could not mark as read. Check your connection and try again.");
    }
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`
      );
      if (!response.ok) {
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
      setError(
        "Could not load more notifications. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <NotificationList items={items} onRead={(id) => void onRead(id)} />
      {cursor ? (
        <button
          type="button"
          className="text-primary text-sm underline disabled:opacity-50"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
