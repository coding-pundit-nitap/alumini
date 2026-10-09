"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Side by side from md up; on phones only one pane shows. */
export function MessengerPanes({
  inbox,
  children,
}: {
  inbox: ReactNode;
  children: ReactNode;
}) {
  const atInbox = usePathname() === "/messages";
  return (
    // Phones: the space between the 3.5rem top bar and the bottom tab bar (main's 5rem padding).
    <div className="flex h-[calc(100svh-8.5rem)] md:h-svh">
      <aside
        aria-label="Conversations"
        className={cn(
          "bg-background w-full shrink-0 md:flex md:w-[340px] md:border-r lg:w-[360px]",
          atInbox ? "flex" : "hidden"
        )}
      >
        <div className="flex min-h-0 w-full flex-col">{inbox}</div>
      </aside>
      <div
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          atInbox ? "hidden" : "flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
