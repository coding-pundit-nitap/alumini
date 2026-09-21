import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/route-access";
import { getActor } from "@/modules/auth";

/**
 * Where a person lands after signing in. The client only navigates here; the server reads the account
 * state (self-healing included) and picks the destination. VERIFIED goes to the page they wanted;
 * PENDING and REJECTED go to onboarding; every other state sees its status page.
 */
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
