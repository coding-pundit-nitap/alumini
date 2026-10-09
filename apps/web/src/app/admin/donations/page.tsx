import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PERMISSIONS } from "@nitap/database/permissions";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-surface";
import { listDonationsForAdmin } from "@/composition/donations";
import { can, getActor } from "@/modules/auth";
import {
  DONATION_STATUS_LABEL,
  DONATION_STATUSES,
  DonationsTable,
} from "@/modules/donations";

import { confirmDonationAction, markNotReceivedAction } from "./actions";

export const metadata: Metadata = { title: "Donations" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** campaign.manage sees open pledges to confirm; donation.view_all sees every pledge. 404 otherwise. */
export default async function AdminDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  const canManage = actor !== null && can(actor, PERMISSIONS.CAMPAIGN_MANAGE);
  if (!actor || (!canManage && !can(actor, PERMISSIONS.DONATION_VIEW_ALL)))
    notFound();
  const { rows, status, viewAll } = await listDonationsForAdmin({
    actor,
    status: first((await searchParams).status),
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Donations"
        description="Match each pledge against the bank statement, then confirm it or mark it not received."
      />
      <AdminPanel
        toolbar={
          viewAll ? (
            <nav aria-label="Status">
              <Segmented>
                {[null, ...DONATION_STATUSES].map((s) => (
                  <Link
                    key={s ?? "all"}
                    href={
                      s ? `/admin/donations?status=${s}` : "/admin/donations"
                    }
                    aria-current={s === status ? "page" : undefined}
                    className={segmentedItemVariants({ active: s === status })}
                  >
                    {s ? DONATION_STATUS_LABEL[s] : "All"}
                  </Link>
                ))}
              </Segmented>
            </nav>
          ) : undefined
        }
      >
        <DonationsTable
          rows={rows}
          canDecide={canManage}
          confirm={confirmDonationAction}
          notReceived={markNotReceivedAction}
        />
      </AdminPanel>
    </div>
  );
}
