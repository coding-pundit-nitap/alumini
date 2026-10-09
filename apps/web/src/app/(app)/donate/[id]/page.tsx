import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageColumns } from "@/components/shell/page-columns";
import { getCampaign } from "@/composition/donations";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import {
  CampaignProgressBar,
  formatDay,
  PledgeForm,
} from "@/modules/donations";

import { pledgeAction } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The campaign, how to pay and the pledge form while it is open. */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/donate/${id}`)}`);
  if (!UUID.test(id)) notFound();

  let result;
  try {
    result = await getCampaign({ actor, campaignId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    throw error;
  }
  const { campaign, acceptsPledges } = result;

  return (
    <PageColumns
      header={
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate font-semibold tracking-tight">
            {campaign.title}
          </h1>
          <p className="text-muted-foreground truncate text-xs">
            {campaign.purpose}
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-6 p-4 sm:p-5">
        <CampaignProgressBar
          progress={campaign}
          goalPaise={campaign.goalPaise}
        />
        <p className="text-sm whitespace-pre-line">{campaign.description}</p>
        <p className="text-muted-foreground text-xs">
          {formatDay(campaign.startsOn)} – {formatDay(campaign.endsOn)}
        </p>
        {acceptsPledges ? (
          <>
            <section className="bg-muted/40 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">How to pay</h2>
              <p className="mt-1 text-sm whitespace-pre-line">
                {campaign.paymentInstructions}
              </p>
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Pledge</h2>
              <PledgeForm campaignId={campaign.id} action={pledgeAction} />
            </section>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            This campaign is not accepting pledges.
          </p>
        )}
      </div>
    </PageColumns>
  );
}
