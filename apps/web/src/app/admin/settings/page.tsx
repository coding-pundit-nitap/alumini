import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
import { listRetentionSettings } from "@/composition/admin";
import { RetentionTable } from "@/modules/admin";
import { can, getActor } from "@/modules/auth";

import { updateRetentionAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

/** Phase 12G. 404 without system.configure (RBAC §8 rule 6). */
export default async function AdminSettingsPage() {
  const actor = await getActor();
  if (!actor || !can(actor, PERMISSIONS.SYSTEM_CONFIGURE)) notFound();
  const settings = await listRetentionSettings({ actor });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <AdminPageHeader
        title="Settings"
        description="How long each kind of record is kept (SRS §45). Every change is audited."
      />
      <AdminPanel
        title="Data retention"
        description="Defaults are placeholders until the institute signs them off."
      >
        <RetentionTable settings={settings} action={updateRetentionAction} />
      </AdminPanel>
    </div>
  );
}
