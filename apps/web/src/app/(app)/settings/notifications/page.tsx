import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageColumns } from "@/components/shell/page-columns";
import { getNotificationPreferences } from "@/composition/notifications";
import { getActor } from "@/modules/auth";
import { PreferencesPanel } from "@/modules/notifications";

export const metadata: Metadata = { title: "Notification preferences" };

export default async function NotificationSettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fsettings%2Fnotifications");

  const preferences = await getNotificationPreferences({ actor });

  return (
    <PageColumns
      header={
        <>
          <Link
            href="/notifications"
            aria-label="Back to notifications"
            className="hover:bg-muted focus-visible:ring-ring -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            <ArrowLeft aria-hidden className="size-[18px]" />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Notification preferences
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Choose what we email you about
            </p>
          </div>
        </>
      }
    >
      <PreferencesPanel initialPreferences={preferences} />
    </PageColumns>
  );
}
