import { PERMISSIONS } from "@nitap/database/permissions";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getMentorProfile,
  listMentors,
  listMentorships,
} from "@/composition/mentorship";
import { getOwnProfile } from "@/composition/users";
import { AppError } from "@/lib/errors";
import { can, getActor, type Actor } from "@/modules/auth";
import {
  MentorList,
  MentorSettingsForm,
  MentorshipList,
  RequestDialog,
  type MentorshipState,
  type MentorshipTab,
} from "@/modules/mentorship";

import {
  requestMentorshipAction,
  saveMentorProfileAction,
  transitionMentorshipAction,
} from "./actions";

export const metadata: Metadata = { title: "Mentorship" };

const LABELS: Record<MentorshipTab, string> = {
  find: "Find a mentor",
  "my-requests": "My requests",
  requests: "Requests",
  mentees: "My mentees",
  settings: "Your mentor settings",
};

/** What each list tab asks `listMentorships` for. */
const QUERY: Record<
  "my-requests" | "requests" | "mentees",
  { role: "mentor" | "mentee"; states?: MentorshipState[] }
> = {
  "my-requests": { role: "mentee" },
  requests: { role: "mentor", states: ["REQUESTED"] },
  mentees: { role: "mentor", states: ["ACCEPTED", "ACTIVE"] },
};

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
  const tabs: MentorshipTab[] = [];
  if (can(actor, PERMISSIONS.MENTORSHIP_REQUEST)) tabs.push("my-requests");
  if (can(actor, PERMISSIONS.MENTORSHIP_RESPOND))
    tabs.push("requests", "mentees");
  if (can(actor, PERMISSIONS.MENTOR_SEARCH)) tabs.unshift("find");
  if (mayOptIn) tabs.push("settings");
  const tab = tabs.find((t) => t === rawTab) ?? tabs[0] ?? "find";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Mentorship</h1>
      <nav aria-label="Mentorship" className="flex flex-wrap gap-4 text-sm">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/mentorship?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={
              t === tab ? "font-semibold underline" : "text-muted-foreground"
            }
          >
            {LABELS[t]}
          </Link>
        ))}
      </nav>
      {tab === "settings" ? (
        <SettingsTab actor={actor} />
      ) : tab === "find" ? (
        <FindTab
          actor={actor}
          topic={topic}
          company={company}
          cursor={cursor}
        />
      ) : (
        <ListTab actor={actor} tab={tab} cursor={cursor} />
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
      <MentorList
        items={page.data}
        requestSlot={
          can(actor, PERMISSIONS.MENTORSHIP_REQUEST)
            ? (m) => (
                <RequestDialog
                  mentor={m}
                  requestAction={requestMentorshipAction}
                />
              )
            : undefined
        }
      />
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

async function ListTab({
  actor,
  tab,
  cursor,
}: {
  actor: Actor;
  tab: keyof typeof QUERY;
  cursor?: string;
}) {
  let page;
  try {
    page = await listMentorships({ actor, ...QUERY[tab], cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect(`/mentorship?tab=${tab}`);
    }
    throw error;
  }

  return (
    <>
      <MentorshipList
        items={page.data}
        tab={tab}
        transitionAction={transitionMentorshipAction}
      />
      {page.page.nextCursor ? (
        <Link
          href={`/mentorship?tab=${tab}&cursor=${encodeURIComponent(page.page.nextCursor)}`}
          className="text-primary block text-center text-sm underline"
        >
          Next page
        </Link>
      ) : null}
    </>
  );
}
