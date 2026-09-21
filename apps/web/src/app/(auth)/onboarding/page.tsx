import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  EvidenceForm,
  OnboardingPanel,
  SignOutButton,
  getActor,
  getOwnVerification,
  listVerificationOptions,
} from "@/modules/auth";

import { submitVerificationAction } from "./actions";

export const metadata: Metadata = { title: "Verify your affiliation" };

export default async function OnboardingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fonboarding");
  if (actor.accountState === "VERIFIED") redirect("/");
  if (actor.accountState !== "PENDING" && actor.accountState !== "REJECTED") {
    redirect("/account/status");
  }

  const [own, options] = await Promise.all([
    getOwnVerification({ actor }),
    listVerificationOptions({ actor }),
  ]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <OnboardingPanel
        own={own}
        form={
          <EvidenceForm
            action={submitVerificationAction}
            departments={options.departments}
            degrees={options.degrees}
          />
        }
      />
      {/* An applicant waiting for review has no other page to sign out from. */}
      <SignOutButton />
    </div>
  );
}
