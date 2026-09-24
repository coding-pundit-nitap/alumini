import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getNotificationPreferences } from "@/composition/notifications";
import { getActor } from "@/modules/auth";
import { PreferencesPanel } from "@/modules/notifications";

export const metadata: Metadata = { title: "Notification preferences" };

export default async function NotificationSettingsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fsettings%2Fnotifications");

  const preferences = await getNotificationPreferences({ actor });

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Notification preferences</h1>
      <PreferencesPanel initialPreferences={preferences} />
    </div>
  );
}
