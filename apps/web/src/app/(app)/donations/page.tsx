import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageColumns } from "@/components/shell/page-columns";
import { listMyDonations } from "@/composition/donations";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { MyDonations } from "@/modules/donations";

import { cancelPledgeAction, setReferenceAction } from "../donate/actions";

export const metadata: Metadata = { title: "My donations" };

/** The member's pledges and where each stands. */
export default async function MyDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ pledged?: string }>;
}) {
  const { pledged } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fdonations");
  let donations;
  try {
    donations = await listMyDonations({ actor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403)
      redirect("/account/status");
    throw error;
  }

  return (
    <PageColumns
      header={
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate font-semibold tracking-tight">
            My donations
          </h1>
          <p className="text-muted-foreground truncate text-xs">
            Your pledges, and whether each payment has been received
          </p>
        </div>
      }
    >
      {pledged ? (
        <p
          role="status"
          className="bg-success/10 text-success m-4 rounded-lg p-3 text-sm"
        >
          Pledge recorded. Pay using the campaign&apos;s instructions, then add
          your payment reference below.
        </p>
      ) : null}
      <MyDonations
        donations={donations}
        setReference={setReferenceAction}
        cancel={cancelPledgeAction}
      />
    </PageColumns>
  );
}
