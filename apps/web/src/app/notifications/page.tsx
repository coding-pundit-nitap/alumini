import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listNotifications } from "@/composition/notifications";
import { getActor } from "@/modules/auth";
import { NotificationInbox } from "@/modules/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fnotifications");

  const page = await listNotifications({ actor });

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationInbox
        initialItems={page.data.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt ? item.readAt.toISOString() : null,
        }))}
        initialNextCursor={page.page.nextCursor}
      />
    </div>
  );
}
