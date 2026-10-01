"use client";

import {
  Ban,
  ChevronDown,
  Clock,
  Flag,
  Loader2,
  SendHorizontal,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "@nitap/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nitap/ui/components/dialog";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";

import { subscribeToMessageStream } from "@/lib/message-stream-client";
import { cn } from "@/lib/utils";

import type { Person } from "../../application/messaging-store";
import {
  ConversationAvatar,
  conversationLabel,
  MESSAGES_CHANGED_EVENT,
  MESSAGES_READ_EVENT,
  photoOf,
} from "./conversation-avatar";
import { clockTime, dayKey, dayLabel } from "./format";

export type ThreadMessage = {
  id: string;
  seq: string;
  senderId: string;
  body: string | null;
  hidden?: boolean;
  createdAt: string;
};

export const TOMBSTONE_TEXT = "This message was removed by a moderator.";

const BACKFILL_MS = 30_000;
const OLDER_PAGE = 30;
const MAX_BODY = 4000;
/** Consecutive messages from one sender within this window share a cluster (one avatar, one tail). */
const CLUSTER_MS = 5 * 60_000;
/** Within this distance of the bottom, new messages scroll into view instead of raising the pill. */
const NEAR_BOTTOM_PX = 120;
const LONG_BODY_CHARS = 700;
const LONG_BODY_LINES = 12;
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

type Row = {
  message: ThreadMessage;
  mine: boolean;
  /** First / last of a same-sender cluster. */
  start: boolean;
  end: boolean;
  sending?: boolean;
};

/** Oldest-first messages → local days → rows marked with their cluster edges. */
function layout(messages: ThreadMessage[], viewerId: string) {
  const days: { key: string; date: Date; rows: Row[] }[] = [];
  messages.forEach((message, i) => {
    const at = new Date(message.createdAt);
    const key = dayKey(at);
    const joins = (other: ThreadMessage | undefined) =>
      other !== undefined &&
      other.senderId === message.senderId &&
      dayKey(new Date(other.createdAt)) === key &&
      Math.abs(new Date(other.createdAt).getTime() - at.getTime()) < CLUSTER_MS;
    if (days.at(-1)?.key !== key) days.push({ key, date: at, rows: [] });
    days.at(-1)!.rows.push({
      message,
      mine: message.senderId === viewerId,
      start: !joins(messages[i - 1]),
      end: !joins(messages[i + 1]),
      sending: message.id.startsWith("pending:"),
    });
  });
  return days;
}

/**
 * One conversation, WhatsApp-style: day separators, sender clusters, an "Unread messages" divider where the
 * viewer left off, older pages loaded as you scroll up (keeping your place), and a pill for new messages that
 * arrive while you are reading history. The server renders the first page; an SSE hint (instant), a 30 s poll
 * and tab focus keep it fresh through the authorized API — the stream carries only ids.
 */
export function Thread(props: {
  conversationId: string;
  viewerId: string;
  people: Person[];
  title?: string | null;
  isGroup?: boolean;
  initialMessages: ThreadMessage[];
  initialNextCursor: string | null;
  /** Where the viewer had read up to when the page loaded; draws the unread divider. */
  initialLastReadSeq?: string | null;
}) {
  const { conversationId, viewerId, people, isGroup = false } = props;
  const base = `/api/v1/conversations/${conversationId}`;
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    [...props.initialMessages].reverse()
  );
  const [nextCursor, setNextCursor] = useState(props.initialNextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [outgoing, setOutgoing] = useState<ThreadMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [farFromBottom, setFarFromBottom] = useState(false);
  // Fixed for the life of the page, like WhatsApp: the divider stays where you left off.
  const [firstUnreadId] = useState(() => {
    const read = props.initialLastReadSeq;
    if (read == null) return null;
    return (
      [...props.initialMessages]
        .reverse()
        .find((m) => m.senderId !== viewerId && BigInt(m.seq) > BigInt(read))
        ?.id ?? null
    );
  });

  // The client id of an unfinished send: a retry of the same text reuses it, so the server dedupes.
  const pending = useRef<{ body: string; id: string } | null>(null);
  const newestSeq = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastId = useRef<string | undefined>(undefined);
  const lastHeight = useRef(0);

  const nameOf = (id: string) =>
    people.find((p) => p.id === id)?.fullName ?? "Former member";
  const personOf = (id: string) => people.find((p) => p.id === id);

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
      })
        .then(() =>
          window.dispatchEvent(
            new CustomEvent(MESSAGES_READ_EVENT, { detail: { conversationId } })
          )
        )
        .catch(() => undefined);
    },
    [base, conversationId]
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

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      const res = await fetch(
        `${base}/messages?limit=${OLDER_PAGE}&cursor=${encodeURIComponent(nextCursor)}`
      );
      if (!res.ok) throw new Error(String(res.status));
      const { data, page } = (await res.json()) as {
        data: ThreadMessage[];
        page: { nextCursor: string | null };
      };
      merge(data);
      setNextCursor(page.nextCursor);
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  }, [base, loadingOlder, merge, nextCursor]);

  useEffect(() => {
    const newest = props.initialMessages[0];
    if (newest) markRead(newest.seq);
  }, [props.initialMessages, markRead]);

  useEffect(() => {
    const unsubscribe = subscribeToMessageStream("message", (event) => {
      try {
        const hint = JSON.parse(event.data) as {
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
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, refresh]);

  // The scroller is `flex-col-reverse`, so the browser itself opens it at the latest message — even in the
  // server-rendered HTML, before any script runs — and scrollTop counts up from the bottom (0 there, negative
  // above). Older pages then prepend without moving the view, natively. Only the unread divider needs a nudge.
  useLayoutEffect(() => {
    if (!firstUnreadId) return;
    scroller.current
      ?.querySelector<HTMLElement>("[data-unread-divider]")
      ?.scrollIntoView?.({ block: "start" });
    // Only on mount: later positioning is driven by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New messages at the bottom: follow them for own sends and while near the bottom; otherwise hold the view
  // still (the browser would keep the distance from the bottom and slide the page) and count them.
  useLayoutEffect(() => {
    const el = scroller.current;
    const all = outgoing ? [...messages, outgoing] : messages;
    const last = all.at(-1);
    if (el && last && lastId.current && last.id !== lastId.current) {
      const previousIndex = all.findIndex((m) => m.id === lastId.current);
      const arrived = all.slice(previousIndex + 1);
      const mineOrNear =
        nearBottom.current || arrived.some((m) => m.senderId === viewerId);
      if (mineOrNear) {
        el.scrollTo?.({ top: 0, behavior: "smooth" });
      } else {
        el.scrollTop -= el.scrollHeight - lastHeight.current;
        setUnseen((n) => n + arrived.length);
      }
    }
    lastId.current = last?.id;
    if (el) lastHeight.current = el.scrollHeight;
  }, [messages, outgoing, viewerId]);

  // Scrolling near the top pages in older history.
  useEffect(() => {
    const target = topSentinel.current;
    if (!target || olderFailed || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlder();
      },
      { root: scroller.current, rootMargin: "240px 0px 0px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadOlder, olderFailed]);

  useEffect(() => {
    if (!reportNotice) return;
    const timer = setTimeout(() => setReportNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [reportNotice]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const distance = Math.abs(el.scrollTop);
    nearBottom.current = distance < NEAR_BOTTOM_PX;
    setFarFromBottom(distance > 400);
    if (nearBottom.current) setUnseen(0);
  }

  function jumpToLatest() {
    const el = scroller.current;
    el?.scrollTo?.({ top: 0, behavior: "smooth" });
    setUnseen(0);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const id =
      pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { body, id };
    setSending(true);
    setError(null);
    setDraft("");
    setOutgoing({
      id: `pending:${id}`,
      seq: "0",
      senderId: viewerId,
      body,
      createdAt: new Date().toISOString(),
    });
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
        window.dispatchEvent(new CustomEvent(MESSAGES_CHANGED_EVENT));
      } else {
        setDraft(body);
        setError(
          await errorMessage(
            res,
            "Your message was not sent. Please try again."
          )
        );
      }
    } catch {
      setDraft(body);
      setError(
        "Your message was not sent. Check your connection and try again."
      );
    } finally {
      setOutgoing(null);
      setSending(false);
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
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
      setReportError(null);
      setReportNotice("Report sent.");
    } else {
      setReportError(
        await errorMessage(res, "The report was not sent. Please try again.")
      );
    }
  }

  const days = layout(outgoing ? [...messages, outgoing] : messages, viewerId);
  const label = conversationLabel(
    { title: props.title ?? null, participants: people },
    viewerId
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label="Messages"
        // Reversed with one child: the list sits at, and opens at, the bottom. The child keeps reading order.
        className="bg-muted/20 flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain px-3 pb-4 [overflow-anchor:none] sm:px-5"
      >
        <div>
          {nextCursor ? (
            <div ref={topSentinel} className="flex justify-center pt-4">
              {loadingOlder ? (
                <Loader2
                  aria-label="Loading older messages"
                  className="text-muted-foreground size-5 animate-spin"
                />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  {olderFailed ? (
                    <p className="text-muted-foreground text-xs">
                      Couldn&apos;t load older messages.
                    </p>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground rounded-full"
                    onClick={() => void loadOlder()}
                  >
                    Load older messages
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-4 text-center">
              <ConversationAvatar
                conversation={{
                  title: props.title ?? null,
                  participants: people,
                }}
                viewerId={viewerId}
                isGroup={isGroup}
                className="size-16"
              />
              <p className="mt-1 font-semibold tracking-tight">{label}</p>
              <p className="text-muted-foreground max-w-xs text-xs">
                {isGroup
                  ? `This is the beginning of ${label}.`
                  : `This is the beginning of your conversation with ${label}.`}{" "}
                Messages are visible only to the people in this conversation.
              </p>
            </div>
          )}

          {days.map((day) => (
            <section key={day.key} aria-label={dayLabel(day.date)}>
              <div className="pointer-events-none sticky top-2 z-10 flex justify-center py-2">
                <span
                  suppressHydrationWarning
                  className="bg-background/90 text-muted-foreground rounded-full border px-3 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur"
                >
                  {dayLabel(day.date)}
                </span>
              </div>
              <ol className="flex flex-col">
                {day.rows.map((row) => (
                  <Fragment key={row.message.id}>
                    {row.message.id === firstUnreadId ? (
                      <li
                        role="separator"
                        aria-label="Unread messages"
                        data-unread-divider
                        className="my-3 flex scroll-mt-14 items-center gap-3"
                      >
                        <span className="bg-brand/30 h-px flex-1" />
                        <span className="text-brand text-[11px] font-semibold tracking-wide uppercase">
                          Unread messages
                        </span>
                        <span className="bg-brand/30 h-px flex-1" />
                      </li>
                    ) : null}
                    <MessageRow
                      row={row}
                      isGroup={isGroup}
                      name={row.mine ? "You" : nameOf(row.message.senderId)}
                      person={personOf(row.message.senderId)}
                      onReport={() => {
                        setReporting(row.message.id);
                        setReportError(null);
                        setReportNotice(null);
                      }}
                    />
                  </Fragment>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>

      {unseen > 0 ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="bg-brand text-brand-foreground animate-in fade-in slide-in-from-bottom-2 absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-lg duration-200"
        >
          <ChevronDown aria-hidden className="size-3.5" />
          {unseen === 1 ? "1 new message" : `${unseen} new messages`}
        </button>
      ) : farFromBottom ? (
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label="Jump to latest message"
          className="bg-background hover:bg-muted animate-in fade-in zoom-in-90 absolute right-4 bottom-24 flex size-10 items-center justify-center rounded-full border shadow-md transition-colors duration-200 sm:right-6"
        >
          <ChevronDown aria-hidden className="size-5" />
        </button>
      ) : null}

      {reportNotice ? (
        <p
          role="status"
          className="bg-foreground text-background animate-in fade-in slide-in-from-bottom-2 absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium shadow-lg"
        >
          {reportNotice}
        </p>
      ) : null}

      <form
        method="post"
        onSubmit={send}
        className="bg-background border-t px-3 py-3 sm:px-5"
      >
        {error ? (
          <p role="alert" className="text-destructive mb-2 px-1 text-sm">
            {error}
          </p>
        ) : null}
        <div className="bg-muted/50 focus-within:border-foreground/20 focus-within:bg-background flex items-end gap-2 rounded-3xl border py-1.5 pr-1.5 pl-4 transition-colors duration-150">
          <textarea
            aria-label="Message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            maxLength={MAX_BODY}
            rows={1}
            placeholder={`Message ${label}`}
            className="placeholder:text-muted-foreground field-sizing-content max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug outline-none"
          />
          <Button
            type="submit"
            variant="brand"
            size="icon"
            disabled={sending || draft.trim().length === 0}
            className="size-9 shrink-0 rounded-full transition-transform duration-150 active:scale-90"
          >
            <SendHorizontal aria-hidden className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1.5 hidden px-4 text-[11px] sm:block">
          <kbd className="font-sans font-medium">Enter</kbd> to send ·{" "}
          <kbd className="font-sans font-medium">Shift + Enter</kbd> for a new
          line
          {draft.length > MAX_BODY - 400 ? (
            <span className="float-right tabular-nums">
              {draft.length}/{MAX_BODY}
            </span>
          ) : null}
        </p>
      </form>

      <Dialog
        open={reporting !== null}
        onOpenChange={(open) => {
          if (!open) setReporting(null);
        }}
      >
        <DialogContent>
          <form method="post" onSubmit={submitReport} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Report message</DialogTitle>
              <DialogDescription>
                Moderators will review it. The sender isn&apos;t told who
                reported it.
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm font-medium">
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={3}
                className="border-input bg-background focus-visible:ring-ring rounded-lg border px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2"
              />
            </label>
            {reportError ? (
              <p role="alert" className="text-destructive text-sm">
                {reportError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReporting(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!reason.trim()}
              >
                Submit report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageRow({
  row,
  isGroup,
  name,
  person,
  onReport,
}: {
  row: Row;
  isGroup: boolean;
  name: string;
  person: Person | undefined;
  onReport: () => void;
}) {
  const { message, mine, start, end, sending } = row;
  const at = new Date(message.createdAt);
  // A very long message folds to a dozen lines behind "Read more", so it never swallows the thread.
  const long =
    (message.body?.length ?? 0) > LONG_BODY_CHARS ||
    (message.body?.split("\n").length ?? 0) > LONG_BODY_LINES;
  const [open, setOpen] = useState(false);
  const time = (
    <time
      dateTime={message.createdAt}
      suppressHydrationWarning
      className={cn(
        // Pinned to the bubble's corner; the spacer after the text reserves its room on the last line.
        "absolute right-3 bottom-1.5 inline-flex items-center gap-1 text-[10px] leading-4 whitespace-nowrap tabular-nums",
        mine ? "text-brand-foreground/70" : "text-muted-foreground"
      )}
    >
      {sending ? (
        <>
          <Clock aria-hidden className="size-3" />
          <span className="sr-only">Sending</span>
        </>
      ) : (
        clockTime(at)
      )}
    </time>
  );

  return (
    <li
      className={cn(
        "group/msg animate-in fade-in slide-in-from-bottom-1 flex items-end gap-2 duration-200",
        mine ? "flex-row-reverse" : "flex-row",
        start ? "mt-3" : "mt-0.5"
      )}
    >
      {!mine ? (
        <span className="w-7 shrink-0">
          {end ? (
            <InitialsAvatar
              name={name}
              seed={message.senderId}
              src={person ? photoOf(person) : null}
              className="size-7"
            />
          ) : null}
        </span>
      ) : null}

      <div
        className={cn(
          "flex max-w-[min(80%,34rem)] min-w-0 flex-col",
          mine ? "items-end" : "items-start"
        )}
      >
        {isGroup && !mine && start ? (
          <span className="text-muted-foreground mb-1 ml-3 text-xs font-medium">
            {name}
          </span>
        ) : null}
        <div
          className={cn(
            "flex items-center gap-1",
            mine ? "flex-row-reverse" : "flex-row"
          )}
        >
          {message.hidden ? (
            <p className="text-muted-foreground flex items-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-2 text-sm italic">
              <span className="sr-only">{name}: </span>
              <Ban aria-hidden className="size-3.5 shrink-0" />
              <span>{TOMBSTONE_TEXT}</span>
            </p>
          ) : (
            <p
              className={cn(
                "relative rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-[0_1px_0.5px_rgb(0_0_0/0.06)]",
                mine
                  ? "bg-brand text-brand-foreground"
                  : "bg-background border",
                mine && !start && "rounded-tr-md",
                mine && !end && "rounded-br-md",
                mine && end && "rounded-br-sm",
                !mine && !start && "rounded-tl-md",
                !mine && !end && "rounded-bl-md",
                !mine && end && "rounded-bl-sm",
                sending && "opacity-70"
              )}
            >
              <span className="sr-only">{name}: </span>
              <span
                className={cn(
                  "break-words whitespace-pre-wrap",
                  long && !open && "line-clamp-12"
                )}
              >
                {message.body}
              </span>
              {long ? (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                  className="mt-1 block text-[13px] font-semibold underline-offset-2 hover:underline"
                >
                  {open ? "Show less" : "Read more"}
                </button>
              ) : null}
              <span aria-hidden className="inline-block w-14" />
              {time}
            </p>
          )}
          {!mine && !message.hidden ? (
            <button
              type="button"
              aria-label={`Report message from ${name}`}
              title="Report"
              onClick={onReport}
              className="text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-[opacity,color,background-color] duration-150 outline-none group-hover/msg:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 [@media(hover:none)]:opacity-40"
            >
              <Flag aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
