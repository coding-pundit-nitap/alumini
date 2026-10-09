"use client";

import {
  BadgeCheck,
  Bell,
  Briefcase,
  CalendarDays,
  Check,
  Flag,
  GraduationCap,
  MessageCircle,
  MessageSquareText,
  Trophy,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { createElement } from "react";

import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { notificationCopy } from "./notification-copy";

export type NotificationItem = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

const ICONS: Record<string, LucideIcon> = {
  connection: UserPlus,
  mentorship: GraduationCap,
  message: MessageCircle,
  job: Briefcase,
  event: CalendarDays,
  comment: MessageSquareText,
  achievement: Trophy,
  report: Flag,
  content: Flag,
  verification: BadgeCheck,
  user: UserCog,
};

/**
 * The icon for a notification type, from its prefix (`job.published` → job); a
 * bell for anything else.
 */
export function iconFor(type: string): LucideIcon {
  return ICONS[type.split(".")[0]!] ?? Bell;
}

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const dayKey = (date: Date) => DAY.format(date); // YYYY-MM-DD

/** "Today", "Yesterday", "12 Sep", or "12 Sep 2025" for another year. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(new Date(iso));
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: key.slice(0, 4) === dayKey(now).slice(0, 4) ? undefined : "numeric",
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(iso))
    .replace("Sept", "Sep");
}

function Row({
  item,
  onRead,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
}) {
  const copy = notificationCopy(item.type, item.payload);
  const unread = !item.readAt;
  return (
    <li
      className={cn(
        "relative flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5",
        unread ? "bg-brand/[0.04] hover:bg-brand/[0.07]" : "hover:bg-muted/30"
      )}
    >
      {unread ? (
        <span
          aria-hidden
          className="bg-brand absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full sm:left-2"
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          unread ? "bg-brand/12 text-brand" : "bg-muted text-muted-foreground"
        )}
      >
        {createElement(iconFor(item.type), { className: "size-[18px]" })}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={copy.actionPath}
            onClick={() => {
              if (unread) onRead(item.id);
            }}
            className={cn(
              "underline-offset-2 hover:underline",
              unread ? "font-semibold" : "text-foreground/80 font-medium"
            )}
          >
            {copy.title}
          </Link>
          <time
            dateTime={item.createdAt}
            title={new Date(item.createdAt).toLocaleString()}
            className="text-muted-foreground shrink-0 text-xs tabular-nums"
            suppressHydrationWarning
          >
            {relativeTime(new Date(item.createdAt))}
          </time>
        </div>
        {copy.body ? (
          <p className="text-muted-foreground text-sm">{copy.body}</p>
        ) : null}
        {unread ? (
          <button
            type="button"
            onClick={() => onRead(item.id)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-1.5 -ml-1 inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-xs font-medium outline-none focus-visible:ring-2"
          >
            <Check aria-hidden className="size-3.5" />
            Mark read
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Renders from the notification alone, so deleted target content still renders;
 * its link just lands on a not-found page.
 */
export function NotificationList({
  items,
  onRead,
}: {
  items: NotificationItem[];
  onRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Bell aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">No notifications yet.</p>
          <p className="text-muted-foreground max-w-xs text-sm">
            You&apos;ll see requests, replies and updates here.
          </p>
        </div>
      </div>
    );
  }

  const groups: { label: string; items: NotificationItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2
            className="text-muted-foreground bg-background/95 border-b px-4 py-2 text-xs font-medium tracking-wide uppercase sm:px-5"
            suppressHydrationWarning
          >
            {group.label}
          </h2>
          <ul className="divide-border divide-y border-b">
            {group.items.map((item) => (
              <Row key={item.id} item={item} onRead={onRead} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
