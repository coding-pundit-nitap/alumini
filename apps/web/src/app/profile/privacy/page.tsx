import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import { PrivacyForm } from "@/modules/users";

import { updatePrivacyAction } from "../actions";

export const metadata: Metadata = { title: "Privacy settings" };

export default async function PrivacyPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fprofile%2Fprivacy");
  if (
    actor.accountState === "SUSPENDED" ||
    actor.accountState === "DEACTIVATED"
  ) {
    redirect("/account/status");
  }

  const { settings } = await getOwnProfile({ actor });

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Privacy settings</h1>
      <PrivacyForm
        action={updatePrivacyAction}
        defaults={{
          visibility: settings.visibility,
          location: settings.location,
        }}
      />
      <Link href="/profile" className="text-sm underline">
        Back to your profile
      </Link>
    </div>
  );
}
