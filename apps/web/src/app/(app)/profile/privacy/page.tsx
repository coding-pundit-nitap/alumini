import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getBadgeSettings, getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import { BadgeRolePicker, PrivacyForm } from "@/modules/users";

import { setBadgeRoleAction, updatePrivacyAction } from "../actions";

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

  const [{ settings }, badge] = await Promise.all([
    getOwnProfile({ actor }),
    getBadgeSettings({ actor }),
  ]);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Privacy settings</h1>
      <PrivacyForm
        action={updatePrivacyAction}
        defaults={{
          visibility: settings.visibility,
          contact: settings.contact,
          location: settings.location,
          experience: settings.experience,
          education: settings.education,
        }}
      />
      {badge.options.length > 0 ? (
        <section id="tick" className="scroll-mt-24 space-y-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold">Profile tick</h2>
            <p className="text-muted-foreground text-sm">
              The seal on your photo tells members what kind of account you
              have. You hold more than one role? Pick the one to show.
            </p>
          </div>
          <BadgeRolePicker
            options={badge.options}
            choice={badge.choice}
            action={setBadgeRoleAction}
          />
        </section>
      ) : null}
      <Link href="/profile" className="text-sm underline">
        Back to your profile
      </Link>
    </div>
  );
}
