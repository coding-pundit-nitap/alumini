import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { listOpenCampaigns } from "@/composition/donations";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { CampaignCard } from "@/modules/donations";

export const metadata: Metadata = { title: "Donate" };

/** Phase 12H: campaigns open for pledges, and closed ones for the record. */
export default async function DonatePage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fdonate");
  let campaigns;
  try {
    campaigns = await listOpenCampaigns({ actor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    throw error;
  }

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">Donate</h1>
            <p className="text-muted-foreground truncate text-xs">
              Support the institute. You pay directly; we record your pledge.
            </p>
          </div>
          <Link
            href="/donations"
            className={buttonVariants({
              size: "sm",
              variant: "outline",
              className: "rounded-full",
            })}
          >
            My donations
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6 p-4 sm:p-5">
        {campaigns.open.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No campaigns are open right now.
          </p>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {campaigns.open.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </section>
        )}
        {campaigns.closed.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-muted-foreground text-sm font-medium">
              Past campaigns
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.closed.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageColumns>
  );
}
