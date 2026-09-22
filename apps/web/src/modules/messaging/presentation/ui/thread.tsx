"use client";

import { Button } from "@nitap/ui/components/button";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import type { Person } from "../../application/messaging-store";

export type ThreadMessage = {
  id: string;
  seq: string;
  senderId: string;
  body: string;
  createdAt: string;
};

const BACKFILL_MS = 30_000;
const JSON_HEADERS = { "content-type": "application/json" };
const bySeq = (a: ThreadMessage, b: ThreadMessage) => {
  const [x, y] = [BigInt(a.seq), BigInt(b.seq)];
  return x < y ? -1 : x > y ? 1 : 0;
};

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/**
 * One conversation. The server renders the first page; this keeps it fresh: an SSE hint (instant), a 30 s
 * poll and a refetch on tab focus (backfill, so a missed hint or a 503 from the stream costs latency, never a
 * message). Everything is fetched through the authorized API; the stream carries only ids.
 */
export function Thread(props: {
  conversationId: string;
  viewerId: string;
  people: Person[];
  initialMessages: ThreadMessage[];
  initialNextCursor: string | null;
}) {
  const { conversationId, viewerId, people } = props;
  const base = `/api/v1/conversations/${conversationId}`;
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    [...props.initialMessages].reverse()
  );
  const [nextCursor, setNextCursor] = useState(props.initialNextCursor);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  // The client id of an unfinished send: a retry of the same text reuses it, so the server dedupes.
  const pending = useRef<{ body: string; id: string } | null>(null);
  const newestSeq = useRef<string | null>(null);

  const nameOf = (id: string) =>
    people.find((p) => p.id === id)?.fullName ?? "Former member";

  const merge = useCallback((incoming: ThreadMessage[]) => {
    setMessages((previous) => {
      const byId = new Map(previous.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(bySeq);
    });
  }, []);

  const markRead = useCallback(
    (seq: string) => {
      if (
        newestSeq.current !== null &&
        BigInt(seq) <= BigInt(newestSeq.current)
      )
        return;
      newestSeq.current = seq;
      void fetch(`${base}/read`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ upToSeq: seq }),
      }).catch(() => undefined);
    },
    [base]
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${base}/messages?limit=50`);
      if (!res.ok) return;
      const { data } = (await res.json()) as { data: ThreadMessage[] };
      merge(data);
      if (data[0]) markRead(data[0].seq);
    } catch {
      // offline: the next hint, poll or focus tries again
    }
  }, [base, markRead, merge]);

  useEffect(() => {
    const newest = props.initialMessages[0];
    if (newest) markRead(newest.seq);
  }, [props.initialMessages, markRead]);

  useEffect(() => {
    const source = new EventSource("/api/v1/messages/stream");
    source.addEventListener("message", (event) => {
      try {
        const hint = JSON.parse((event as MessageEvent).data) as {
          conversationId?: string;
        };
        if (hint.conversationId === conversationId) void refresh();
      } catch {
        // a malformed hint is ignored
      }
    });
    const poll = setInterval(() => void refresh(), BACKFILL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source.close();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, refresh]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const id =
      pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { body, id };
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ body, clientMessageId: id }),
      });
      if (res.ok) {
        const { data } = (await res.json()) as { data: ThreadMessage };
        merge([data]);
        markRead(data.seq);
        pending.current = null;
        setDraft("");
      } else {
        setError(
          await errorMessage(
            res,
            "Your message was not sent. Please try again."
          )
        );
      }
    } catch {
      setError(
        "Your message was not sent. Check your connection and try again."
      );
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!nextCursor) return;
    const res = await fetch(
      `${base}/messages?limit=30&cursor=${encodeURIComponent(nextCursor)}`
    );
    if (!res.ok) return;
    const { data, page } = (await res.json()) as {
      data: ThreadMessage[];
      page: { nextCursor: string | null };
    };
    merge(data);
    setNextCursor(page.nextCursor);
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!reporting || !reason.trim()) return;
    const res = await fetch("/api/v1/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        targetType: "MESSAGE",
        targetId: reporting,
        reason: reason.trim(),
      }),
    });
    if (res.ok) {
      setReporting(null);
      setReason("");
      setReportNotice("Report sent.");
    } else {
      setError(
        await errorMessage(res, "The report was not sent. Please try again.")
      );
    }
  }

  return (
    <div className="space-y-4">
      {nextCursor ? (
        <Button variant="outline" onClick={() => void loadOlder()}>
          Load older messages
        </Button>
      ) : null}

      <ol aria-label="Messages" className="space-y-3">
        {messages.map((m) => {
          const mine = m.senderId === viewerId;
          return (
            <li key={m.id} className={mine ? "text-right" : undefined}>
              <p className="text-muted-foreground text-xs">
                {mine ? "You" : nameOf(m.senderId)} ·{" "}
                {/* The server's locale is not the reader's, so the two renders of this stamp differ. Without
                    this React calls that a hydration failure and re-renders the whole tree from scratch,
                    which loses the click that was in flight and flashes the thread empty. */}
                <time dateTime={m.createdAt} suppressHydrationWarning>
                  {new Date(m.createdAt).toLocaleString()}
                </time>
              </p>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              {!mine ? (
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline"
                  aria-label={`Report message from ${nameOf(m.senderId)}`}
                  onClick={() => {
                    setReporting(m.id);
                    setReportNotice(null);
                  }}
                >
                  Report
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {reporting ? (
        <form onSubmit={submitReport} className="space-y-2">
          <textarea
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit">Submit report</Button>{" "}
          <Button
            type="button"
            variant="outline"
            onClick={() => setReporting(null)}
          >
            Cancel
          </Button>
        </form>
      ) : null}
      {reportNotice ? <p role="status">{reportNotice}</p> : null}

      <form onSubmit={send} className="space-y-2">
        <textarea
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={sending}>
          Send
        </Button>
      </form>
    </div>
  );
}
