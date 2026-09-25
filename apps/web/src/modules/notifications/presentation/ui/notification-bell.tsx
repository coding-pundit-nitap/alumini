"use client";

import { ArrowRight, Bell, Settings } from "lucide-react";
import Link from "next/link";
import { createElement } from "react";

import { Button } from "@nitap/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";

import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { notificationCopy } from "./notification-copy";
import { iconFor } from "./notification-list";
import { useNotifications } from "./use-notifications";

export function NotificationBell() {
  const { count, items, markRead } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="relative rounded-full"
          />
        }
      >
        <Bell />
        {count > 0 && (
          <span
            data-testid="unread-badge"
            className="bg-brand text-brand-foreground ring-background absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ring-2"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="border-b px-3.5 py-2.5">
          <p className="text-sm font-semibold">
            Notifications
            {count > 0 ? (
              <span className="text-brand ml-1.5 text-xs font-medium">
                {count > 99 ? "99+" : count} new
              </span>
            ) : null}
          </p>
        </div>
        <div className="p-1">
          {items.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="flex-col gap-2 py-6 text-center"
            >
              <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
                <Bell aria-hidden className="size-4" />
              </span>
              No notifications yet
            </DropdownMenuItem>
          ) : (
            items.map((item) => {
              const copy = notificationCopy(item.type, item.payload);
              const unread = !item.readAt;
              return (
                <DropdownMenuItem
                  key={item.id}
                  render={<Link href={copy.actionPath} />}
                  onClick={() => {
                    if (unread) void markRead(item.id);
                  }}
                  className="items-start gap-3 rounded-lg px-2.5 py-2.5"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      unread
                        ? "bg-brand/12 text-brand"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {createElement(iconFor(item.type), {
                      className: "size-4",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        unread
                          ? "font-semibold"
                          : "text-muted-foreground font-medium"
                      )}
                    >
                      {copy.title}
                    </span>
                    {copy.body ? (
                      <span className="text-muted-foreground block truncate text-xs">
                        {copy.body}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <time
                      dateTime={item.createdAt}
                      className="text-muted-foreground text-[11px] tabular-nums"
                      suppressHydrationWarning
                    >
                      {relativeTime(new Date(item.createdAt))}
                    </time>
                    {unread ? (
                      <span className="bg-brand size-2 rounded-full">
                        <span className="sr-only">Unread</span>
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
        <div className="flex gap-1 border-t p-1">
          <DropdownMenuItem
            render={<Link href="/notifications" />}
            className="flex-1 justify-center gap-1.5 rounded-lg text-sm font-medium"
          >
            View all notifications
            <ArrowRight aria-hidden className="size-3.5" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/settings/notifications" />}
            aria-label="Notification settings"
            className="text-muted-foreground rounded-lg px-2.5"
          >
            <Settings aria-hidden className="size-4" />
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
