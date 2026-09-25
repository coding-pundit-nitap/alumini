import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageColumns } from "@/components/shell/page-columns";
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
    <PageColumns
      header={
        <>
          <Link
            href="/profile"
            aria-label="Back to your profile"
            className="hover:bg-muted focus-visible:ring-ring -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            <ArrowLeft aria-hidden className="size-[18px]" />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Privacy settings
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Choose who sees what on your profile
            </p>
          </div>
        </>
      }
    >
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
        <section id="tick" className="scroll-mt-24 px-4 py-5 sm:px-5">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Profile tick
          </h2>
          <p className="text-muted-foreground mt-1 mb-3 text-xs">
            The seal on your photo tells members what kind of account you have.
            You hold more than one role? Pick the one to show.
          </p>
          <BadgeRolePicker
            options={badge.options}
            choice={badge.choice}
            action={setBadgeRoleAction}
          />
        </section>
      ) : null}
    </PageColumns>
  );
}
