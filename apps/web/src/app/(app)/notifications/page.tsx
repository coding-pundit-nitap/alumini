import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageColumns } from "@/components/shell/page-columns";
import { listNotifications } from "@/composition/notifications";
import { getActor } from "@/modules/auth";
import { NotificationInbox } from "@/modules/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fnotifications");

  const page = await listNotifications({ actor });

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Requests, replies and updates from your network
            </p>
          </div>
          <Link
            href="/settings/notifications"
            aria-label="Notification settings"
            title="Notification settings"
            className="hover:bg-muted focus-visible:ring-ring flex size-9 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            <Settings aria-hidden className="size-[18px]" />
          </Link>
        </>
      }
    >
      <NotificationInbox
        initialItems={page.data.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt ? item.readAt.toISOString() : null,
        }))}
        initialNextCursor={page.page.nextCursor}
      />
    </PageColumns>
  );
}
