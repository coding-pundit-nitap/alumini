"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { Badge } from "@nitap/ui/components/badge";
import { Button } from "@nitap/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";

import { notificationCopy } from "./notification-copy";
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
            className="relative"
          />
        }
      >
        <Bell />
        {count > 0 && (
          <Badge
            data-testid="unread-badge"
            className="absolute -top-1 -right-1"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {items.length === 0 ? (
          <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              render={
                <Link
                  href={notificationCopy(item.type, item.payload).actionPath}
                />
              }
              onClick={() => {
                if (!item.readAt) void markRead(item.id);
              }}
            >
              <span className={item.readAt ? "text-muted-foreground" : ""}>
                {notificationCopy(item.type, item.payload).title}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem render={<Link href="/notifications" />}>
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
