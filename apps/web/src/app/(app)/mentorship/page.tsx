import { PERMISSIONS } from "@nitap/database/permissions";
import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { startConversationAction } from "@/app/(app)/messages/actions";
import { PageColumns } from "@/components/shell/page-columns";
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

/** The Requests badge reads at most this many; beyond it the exact number is unknown ("50+"). */
const BADGE_CAP = 50;

const NEXT_LINK = buttonVariants({
  variant: "ghost",
  size: "sm",
  className: "text-muted-foreground rounded-full",
});

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

  const isMentor = tabs.includes("requests");
  // One capped read feeds the badge; the Requests tab's own list is the count when it is open.
  let waiting = 0;
  if (isMentor && tab !== "requests") {
    try {
      waiting = (
        await listMentorships({ actor, ...QUERY.requests, limit: BADGE_CAP })
      ).data.length;
    } catch {
      // The badge is a nicety; the tab itself reports real errors.
    }
  }

  return (
    <PageColumns
      header={
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate font-semibold tracking-tight">Mentorship</h1>
          <p className="text-muted-foreground truncate text-xs">
            {isMentor
              ? "Guide students from your department and beyond"
              : "Learn from alumni who have been there"}
          </p>
        </div>
      }
    >
      <nav
        aria-label="Mentorship"
        className="scrollbar-none overflow-x-auto border-b px-4 py-3 sm:px-5"
      >
        <Segmented>
          {tabs.map((t) => (
            <Link
              key={t}
              href={`/mentorship?tab=${t}`}
              aria-current={t === tab ? "page" : undefined}
              className={segmentedItemVariants({ active: t === tab })}
            >
              {LABELS[t]}
              {t === "requests" && waiting ? (
                <span
                  aria-label={`${waiting >= BADGE_CAP ? `${BADGE_CAP}+` : waiting} waiting`}
                  className="bg-brand text-brand-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                >
                  {waiting >= BADGE_CAP ? `${BADGE_CAP}+` : waiting}
                </span>
              ) : null}
            </Link>
          ))}
        </Segmented>
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
    </PageColumns>
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
      <form
        method="get"
        role="search"
        className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-5"
      >
        <input type="hidden" name="tab" value="find" />
        <label className="bg-muted/60 focus-within:ring-ring/60 flex h-10 min-w-40 flex-1 items-center gap-2 rounded-full px-4 focus-within:ring-2">
          <Search aria-hidden className="text-muted-foreground size-4" />
          <span className="sr-only">Topic</span>
          <input
            name="topic"
            defaultValue={topic ?? ""}
            placeholder="Topic"
            maxLength={40}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="bg-muted/60 focus-within:ring-ring/60 flex h-10 min-w-40 flex-1 items-center gap-2 rounded-full px-4 focus-within:ring-2">
          <Building2 aria-hidden className="text-muted-foreground size-4" />
          <span className="sr-only">Company</span>
          <input
            name="company"
            defaultValue={company ?? ""}
            placeholder="Company"
            maxLength={100}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Button type="submit" className="h-10 rounded-full px-5">
          Search
        </Button>
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
        <div className="flex justify-center border-t py-4">
          <Link
            href={`/mentorship?${next.toString()}&cursor=${encodeURIComponent(page.page.nextCursor)}`}
            className={NEXT_LINK}
          >
            Next page
          </Link>
        </div>
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
        messageAction={startConversationAction}
      />
      {page.page.nextCursor ? (
        <div className="flex justify-center border-t py-4">
          <Link
            href={`/mentorship?tab=${tab}&cursor=${encodeURIComponent(page.page.nextCursor)}`}
            className={NEXT_LINK}
          >
            Next page
          </Link>
        </div>
      ) : null}
    </>
  );
}
