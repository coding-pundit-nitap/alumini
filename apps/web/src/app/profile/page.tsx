import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import { ProfileForm } from "@/modules/users";
import { PhotoUpload } from "@/modules/uploads";

import { updateProfileAction } from "./actions";
import {
  completePhotoUploadAction,
  getUploadStatusAction,
  presignPhotoUploadAction,
  setProfilePhotoAction,
} from "./photo-actions";

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
      <PhotoUpload
        photoUrl={
          profile.photoUploadId ? `/api/photos/${profile.userId}` : null
        }
        presignAction={presignPhotoUploadAction}
        completeAction={completePhotoUploadAction}
        statusAction={getUploadStatusAction}
        setPhotoAction={setProfilePhotoAction}
      />
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
      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/directory" className="underline">
          Alumni directory
        </Link>
        <Link href="/connections" className="underline">
          Your connections
        </Link>
        <Link href="/messages" className="underline">
          Messages
        </Link>
        <Link href="/mentorship" className="underline">
          Mentorship
        </Link>
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
