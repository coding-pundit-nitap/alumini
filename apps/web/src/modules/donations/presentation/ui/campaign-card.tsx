import Link from "next/link";

import type { CampaignWithProgress } from "../../domain/donation";
import { formatDay } from "../labels";
import { CampaignProgressBar } from "./campaign-progress";

export function CampaignCard({ campaign }: { campaign: CampaignWithProgress }) {
  return (
    <Link
      href={`/donate/${campaign.id}`}
      className="bg-card hover:border-foreground/20 flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:p-5"
    >
      <div>
        <h2 className="font-semibold tracking-tight">{campaign.title}</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {campaign.purpose}
        </p>
      </div>
      <CampaignProgressBar progress={campaign} goalPaise={campaign.goalPaise} />
      <p className="text-muted-foreground text-xs">
        {campaign.status === "CLOSED"
          ? `Closed · ran until ${formatDay(campaign.endsOn)}`
          : `Open until ${formatDay(campaign.endsOn)}`}
      </p>
    </Link>
  );
}
