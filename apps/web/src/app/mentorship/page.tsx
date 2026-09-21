import { PERMISSIONS } from "@nitap/database/permissions";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getMentorProfile, listMentors } from "@/composition/mentorship";
import { getOwnProfile } from "@/composition/users";
import { AppError } from "@/lib/errors";
import { can, getActor, type Actor } from "@/modules/auth";
import { MentorList, MentorSettingsForm } from "@/modules/mentorship";

import { saveMentorProfileAction } from "./actions";

export const metadata: Metadata = { title: "Mentorship" };

type Tab = "find" | "settings";

export default async function MentorshipPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    topic?: string;
    company?: string;
    cursor?: string;
  }>;
}) {
  const { tab: rawTab, topic, company, cursor } = await searchParams;

  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fmentorship");

  const mayOptIn = can(actor, PERMISSIONS.MENTOR_OPT_IN);
  const tab: Tab = rawTab === "settings" && mayOptIn ? "settings" : "find";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Mentorship</h1>
      <nav aria-label="Mentorship" className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/mentorship?tab=find"
          aria-current={tab === "find" ? "page" : undefined}
          className={
            tab === "find" ? "font-semibold underline" : "text-muted-foreground"
          }
        >
          Find a mentor
        </Link>
        {mayOptIn ? (
          <Link
            href="/mentorship?tab=settings"
            aria-current={tab === "settings" ? "page" : undefined}
            className={
              tab === "settings"
                ? "font-semibold underline"
                : "text-muted-foreground"
            }
          >
            Your mentor settings
          </Link>
        ) : null}
      </nav>
      {tab === "settings" ? (
        <SettingsTab actor={actor} />
      ) : (
        <FindTab
          actor={actor}
          topic={topic}
          company={company}
          cursor={cursor}
        />
      )}
    </div>
  );
}

async function SettingsTab({ actor }: { actor: Actor }) {
  let profile;
  let ownVisibility;
  try {
    profile = await getMentorProfile({ actor });
    ownVisibility = (await getOwnProfile({ actor })).settings.visibility;
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    throw error;
  }

  const listedNote =
    ownVisibility === "PRIVATE"
      ? "Your profile is private, so you are not listed until you change its visibility."
      : null;

  return (
    <MentorSettingsForm
      defaults={profile}
      listedNote={listedNote}
      saveAction={saveMentorProfileAction}
    />
  );
}

async function FindTab({
  actor,
  topic,
  company,
  cursor,
}: {
  actor: Actor;
  topic?: string;
  company?: string;
  cursor?: string;
}) {
  let page;
  try {
    page = await listMentors({ actor, topic, company, cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect("/mentorship?tab=find");
    }
    throw error;
  }

  const next = new URLSearchParams({ tab: "find" });
  if (topic) next.set("topic", topic);
  if (company) next.set("company", company);

  return (
    <>
      <form method="get" className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="find" />
        <label className="flex-1 space-y-1 text-sm">
          <span className="sr-only">Topic</span>
          <input
            name="topic"
            defaultValue={topic ?? ""}
            placeholder="Topic"
            maxLength={40}
            className="border-input bg-background h-9 w-full rounded-md border px-2.5 text-sm"
          />
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="sr-only">Company</span>
          <input
            name="company"
            defaultValue={company ?? ""}
            placeholder="Company"
            maxLength={100}
            className="border-input bg-background h-9 w-full rounded-md border px-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          Search
        </button>
      </form>
      <MentorList items={page.data} />
      {page.page.nextCursor ? (
        <Link
          href={`/mentorship?${next.toString()}&cursor=${encodeURIComponent(page.page.nextCursor)}`}
          className="text-primary block text-center text-sm underline"
        >
          Next page
        </Link>
      ) : null}
    </>
  );
}
