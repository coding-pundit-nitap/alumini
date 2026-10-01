import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@nitap/database/permissions";

import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
import { listCampaignsForAdmin } from "@/composition/donations";
import { can, getActor } from "@/modules/auth";
import { CampaignDialog, CampaignsTable } from "@/modules/donations";

import { changeCampaignStatusAction, saveCampaignAction } from "./actions";

export const metadata: Metadata = { title: "Campaigns" };

/** Phase 12H (FR-DON-001). 404 without campaign.manage (RBAC §8 rule 6). */
export default async function AdminCampaignsPage() {
  const actor = await getActor();
  if (!actor || !can(actor, PERMISSIONS.CAMPAIGN_MANAGE)) notFound();
  const campaigns = await listCampaignsForAdmin({ actor });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Campaigns"
        description="Fundraising campaigns. Members pay outside the app using your instructions."
        actions={<CampaignDialog action={saveCampaignAction} />}
      />
      <AdminPanel>
        <CampaignsTable
          campaigns={campaigns}
          save={saveCampaignAction}
          changeStatus={changeCampaignStatusAction}
        />
      </AdminPanel>
    </div>
  );
}
