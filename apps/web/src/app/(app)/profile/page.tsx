import {
  BellRing,
  BriefcaseBusiness,
  ChevronRight,
  Eye,
  Lock,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import { ProfileForm, profileCompleteness } from "@/modules/users";
import { PhotoUpload } from "@/modules/uploads";

import { updateProfileAction } from "./actions";
import {
  completePhotoUploadAction,
  getUploadStatusAction,
  presignPhotoUploadAction,
  setProfilePhotoAction,
} from "./photo-actions";

export const metadata: Metadata = { title: "Your profile" };

/** Where each missing completeness item is fixed. */
const FIX: Record<string, string> = {
  Photo: "#photo",
  Headline: "#basics",
  About: "#basics",
  Location: "#basics",
  Experience: "/profile/details#experience",
  Education: "/profile/details#education",
  Skills: "/profile/details#skills",
  Links: "/profile/details#links",
};

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 border-b px-4 py-6 sm:px-5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NavRow({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/50 focus-visible:ring-ring group flex items-center gap-3.5 rounded-xl px-2 py-3 transition-colors duration-150 outline-none focus-visible:ring-2"
      >
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {detail}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="text-muted-foreground size-4 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

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
  const { percent, missing } = profileCompleteness(profile);

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="font-semibold tracking-tight">Edit profile</h1>
            <p className="text-muted-foreground truncate text-xs">
              What batchmates see when they find you
            </p>
          </div>
          <Link
            href={`/members/${profile.userId}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            <Eye aria-hidden />
            View my profile
          </Link>
        </>
      }
    >
      {percent < 100 ? (
        <div className="border-b px-4 py-5 sm:px-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">Profile {percent}% complete</p>
            <p className="text-muted-foreground text-xs">
              {missing.length} to go
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Profile completeness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="from-brand to-chart-2 h-full rounded-full bg-gradient-to-r"
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {missing.map((label) => (
              <li key={label}>
                <Link
                  href={FIX[label] ?? "#basics"}
                  className="hover:border-brand/50 hover:text-brand text-muted-foreground rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors"
                >
                  + {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section id="photo" title="Photo">
        <PhotoUpload
          photoUrl={
            profile.photoUploadId ? `/api/photos/${profile.userId}` : null
          }
          presignAction={presignPhotoUploadAction}
          completeAction={completePhotoUploadAction}
          statusAction={getUploadStatusAction}
          setPhotoAction={setProfilePhotoAction}
        />
      </Section>

      <Section
        id="basics"
        title="Basics"
        description="Your name, the line under it, and a short introduction."
      >
        <ProfileForm
          action={updateProfileAction}
          defaults={{
            fullName: profile.fullName,
            headline: profile.headline,
            bio: profile.bio,
            location: profile.location,
          }}
        />
      </Section>

      <Section
        title="From your verification"
        description="Your department, degree and graduation year come from your verification and cannot be edited here."
      >
        <dl className="bg-muted/40 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
          {(
            [
              ["Department", profile.department],
              ["Degree", profile.degree],
              ["Batch", profile.graduationYear],
            ] as const
          ).map(([term, value]) => (
            <div key={term} className="bg-background px-4 py-3">
              <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Lock aria-hidden className="size-3" />
                {term}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium">
                {value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="More">
        <ul className="-mx-2">
          <NavRow
            href="/profile/details"
            icon={<BriefcaseBusiness aria-hidden className="size-5" />}
            title="Experience, education, skills & links"
            detail={[
              count(profile.experience.length, "role", "roles"),
              count(profile.education.length, "school", "schools"),
              count(profile.skills.length, "skill", "skills"),
              count(profile.links.length, "link", "links"),
            ].join(" · ")}
          />
          <NavRow
            href="/profile/privacy"
            icon={<ShieldCheck aria-hidden className="size-5" />}
            title="Privacy settings"
            detail="Choose who sees each part of your profile"
          />
          <NavRow
            href="/settings/notifications"
            icon={<BellRing aria-hidden className="size-5" />}
            title="Notification preferences"
            detail="Email and in-app alerts"
          />
        </ul>
      </Section>
    </PageColumns>
  );
}
