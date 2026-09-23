"use client";

import { Button } from "@nitap/ui/components/button";
import { Card } from "@nitap/ui/components/card";

export type NotificationItem = {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

const humanize = (type: string) => type.replace(/[._]/g, " ");

/**
 * The full notification inbox. Renders from `type` and `createdAt` alone — a notification whose target
 * content (a post, a job, an event…) has since been deleted still renders fine, since nothing here looks it
 * up.
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
      {items.map((item) => (
        <Card key={item.id} className={item.readAt ? "opacity-60" : ""}>
          <div className="flex items-center justify-between gap-4 px-4">
            <div>
              <p className="capitalize">{humanize(item.type)}</p>
              <time
                dateTime={item.createdAt}
                className="text-muted-foreground text-xs"
                suppressHydrationWarning
              >
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </div>
            {!item.readAt && (
              <Button variant="ghost" size="sm" onClick={() => onRead(item.id)}>
                Mark read
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
