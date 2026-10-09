import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/route-access";
import { getActor } from "@/modules/auth";

/** The server reads the account state and picks the destination after sign-in. */
export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { next } = await searchParams;
  if (actor.accountState === "VERIFIED") {
    redirect(safeNextPath(typeof next === "string" ? next : undefined));
  }
  // Accounts that can still be verified go to onboarding; the rest see their status.
  redirect(
    actor.accountState === "PENDING" || actor.accountState === "REJECTED"
      ? "/onboarding"
      : "/account/status"
  );
}
