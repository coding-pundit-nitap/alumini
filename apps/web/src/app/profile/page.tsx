import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import { ProfileForm } from "@/modules/users";

import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fprofile");
  if (
    actor.accountState === "SUSPENDED" ||
    actor.accountState === "DEACTIVATED"
  ) {
    redirect("/account/status");
  }

  const profile = await getOwnProfile({ actor });

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <ProfileForm
        action={updateProfileAction}
        defaults={{
          fullName: profile.fullName,
          headline: profile.headline,
          bio: profile.bio,
          location: profile.location,
        }}
      />
      <p className="text-muted-foreground text-sm">
        Your department, degree and graduation year come from your verification
        and cannot be edited here.
      </p>
      <nav className="flex gap-4 text-sm">
        <Link href="/profile/details" className="underline">
          Experience, education, skills & links
        </Link>
        <Link href="/profile/privacy" className="underline">
          Privacy settings
        </Link>
        <Link href={`/members/${profile.userId}`} className="underline">
          View my profile
        </Link>
      </nav>
    </div>
  );
}
