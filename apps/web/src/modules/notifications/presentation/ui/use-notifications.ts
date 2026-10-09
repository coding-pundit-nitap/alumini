"use client";

import { useCallback, useEffect, useState } from "react";

import { subscribeToMessageStream } from "@/lib/message-stream-client";

export type BellNotification = {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;
const RECENT_LIMIT = 5;

/**
 * Unread count and recent notifications for the bell. Refreshes on a 30 s poll, tab focus and SSE
 * hints, and falls back to polling if the stream is unavailable.
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

    const unsubscribe = subscribeToMessageStream(
      "notification",
      () => void refresh()
    );

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [refresh]);

  return { count, items, refresh, markRead };
}
