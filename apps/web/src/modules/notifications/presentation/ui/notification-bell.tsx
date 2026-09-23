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

import { useNotifications } from "./use-notifications";

const humanize = (type: string) => type.replace(/[._]/g, " ");

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
              className="flex items-center justify-between gap-2"
              onClick={(event) => {
                if (!item.readAt) {
                  event.preventDefault();
                  void markRead(item.id);
                }
              }}
            >
              <span className={item.readAt ? "text-muted-foreground" : ""}>
                {humanize(item.type)}
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
