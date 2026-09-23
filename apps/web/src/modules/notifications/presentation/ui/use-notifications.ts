"use client";

import { useCallback, useEffect, useState } from "react";

export type BellNotification = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;
const RECENT_LIMIT = 5;

/**
 * Unread count and the most recent notifications for the header bell. Refreshes on a 30 s poll, on
 * `visibilitychange` and on an SSE "notification" hint (falls back to the poll alone when the stream 503s —
 * Redis being down must never break reading the count or the list, spec N-9).
 */
export function useNotifications() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<BellNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      const countRes = await fetch("/api/v1/notifications/unread-count");
      if (countRes.ok) {
        const body = (await countRes.json()) as { data: { count: number } };
        setCount(body.data.count);
      }
    } catch {
      // offline: the next poll, hint or focus retries
    }
    try {
      const listRes = await fetch(
        `/api/v1/notifications?limit=${RECENT_LIMIT}`
      );
      if (listRes.ok) {
        const body = (await listRes.json()) as { data: BellNotification[] };
        setItems(body.data);
      }
    } catch {
      // offline: the next poll, hint or focus retries
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
    setCount((previous) => Math.max(0, previous - 1));
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      // best-effort; the next refresh reconciles
    }
  }, []);

  useEffect(() => {
    // No server-rendered initial data here (the bell has no page-level props to seed from), so the first
    // fetch happens on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client fetch, not derived state
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let source: EventSource | undefined;
    try {
      source = new EventSource("/api/v1/messages/stream");
      source.addEventListener("notification", () => void refresh());
    } catch {
      // EventSource unavailable or the stream can't connect: the poll still covers it
    }

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      source?.close();
    };
  }, [refresh]);

  return { count, items, refresh, markRead };
}
