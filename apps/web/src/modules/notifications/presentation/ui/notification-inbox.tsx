"use client";

import { useState } from "react";

import { NotificationList, type NotificationItem } from "./notification-list";

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * The `/notifications` client shell: owns mark-read and load-more state around the server-rendered first
 * page. `NotificationList` stays a dumb presentational component; this is where the fetches live.
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

  const onRead = (id: string) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
    void fetch(`/api/v1/notifications/${id}/read`, {
      method: "POST",
      headers: JSON_HEADERS,
    }).catch(() => undefined);
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        data: NotificationItem[];
        page: { nextCursor: string | null };
      };
      setItems((previous) => [...previous, ...body.data]);
      setCursor(body.page.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <NotificationList items={items} onRead={onRead} />
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
