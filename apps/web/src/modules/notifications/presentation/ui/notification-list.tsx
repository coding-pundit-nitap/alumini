"use client";

import Link from "next/link";

import { Button } from "@nitap/ui/components/button";
import { Card } from "@nitap/ui/components/card";

export type NotificationItem = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

import { notificationCopy } from "./notification-copy";

/**
 * The full notification inbox. Renders from `type`, the ids in `payload` and `createdAt` alone — a
 * notification whose target content (a post, a job, an event…) has since been deleted still renders fine,
 * since nothing here looks it up; its link just lands on a not-found or list page.
 */
export function NotificationList({
  items,
  onRead,
}: {
  items: NotificationItem[];
  onRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground">No notifications yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const copy = notificationCopy(item.type, item.payload);
        return (
          <Card key={item.id} className={item.readAt ? "opacity-60" : ""}>
            <div className="flex items-center justify-between gap-4 px-4">
              <div>
                <Link
                  href={copy.actionPath}
                  className="font-medium hover:underline"
                >
                  {copy.title}
                </Link>
                {copy.body && (
                  <p className="text-muted-foreground text-sm">{copy.body}</p>
                )}
                <time
                  dateTime={item.createdAt}
                  className="text-muted-foreground text-xs"
                  suppressHydrationWarning
                >
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </div>
              {!item.readAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRead(item.id)}
                >
                  Mark read
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
