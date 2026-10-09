import { cache, Suspense } from "react";

import { listConnections } from "@/composition/connections";
import { listDepartments } from "@/composition/directory";
import { listEvents } from "@/composition/events";
import { listPublishedJobs } from "@/composition/jobs";
import {
  getMentorProfile,
  listMentors,
  listMentorships,
} from "@/composition/mentorship";
import { listConversations } from "@/composition/messaging";
import { getUnreadCount } from "@/composition/notifications";
import { getOwnProfile } from "@/composition/users";
import { can, PERMISSIONS, type Actor } from "@/modules/auth";
import { profileCompleteness } from "@/modules/users";

import { AttentionTiles, COUNT_CAP } from "./attention-tiles";
import { BlockError } from "./block-error";
import { BlockSkeleton } from "./block-skeleton";
import { CompletenessCard } from "./completeness-card";
import { Guidance } from "./guidance";
import { EventList, JobList, PeopleList } from "./lists";
import { loadBlock } from "./load-block";
import { summarizeCounts } from "./summarize-counts";

// Per-request memos (keyed on the one `actor` object the page passes down), so FirstRun reuses the
// reads the other blocks already made instead of repeating them.
const loadProfile = cache((actor: Actor) =>
  loadBlock(() => getOwnProfile({ actor }))
);
const loadJobs = cache((actor: Actor) =>
  loadBlock(() => listPublishedJobs({ actor, limit: 5 }))
);
const loadEvents = cache((actor: Actor) =>
  loadBlock(() => listEvents({ actor, scope: "upcoming", limit: 5 }))
);
const loadMentorProfile = cache((actor: Actor) =>
  loadBlock(() => getMentorProfile({ actor }))
);

/**
 * ponytail: each count reads ≤ 50 rows and shows "50+" at the cap; add count queries if members
 * routinely exceed it.
 *
 * A real failure in one of the four reads must not read as "0 requests" with no signal — it's
 * excluded from its tile and `failed` tells `Attention` to render an inline error alongside whatever
 * tiles did load.
 */
const loadCounts = cache(async (actor: Actor) => {
  const [
    connectionRequests,
    unreadMessages,
    mentorshipRequests,
    unreadNotifications,
  ] = await Promise.all([
    loadBlock(
      async () =>
        (
          await listConnections({
            actor,
            state: "PENDING",
            direction: "INCOMING",
            limit: COUNT_CAP,
          })
        ).data.length
    ),
    loadBlock(async () =>
      (await listConversations({ actor, limit: COUNT_CAP })).data.reduce(
        (sum, c) => sum + c.unreadCount,
        0
      )
    ),
    loadBlock(async () => {
      const mentor = await loadMentorProfile(actor);
      if (mentor.status !== "ok" || !mentor.value) return 0;
      return (
        await listMentorships({
          actor,
          role: "mentor",
          states: ["REQUESTED"],
          limit: COUNT_CAP,
        })
      ).data.length;
    }),
    loadBlock(() => getUnreadCount({ actor })),
  ]);
  return summarizeCounts({
    connectionRequests,
    unreadMessages,
    mentorshipRequests,
    unreadNotifications,
  });
});

/** Greeting: the home page's one display-type moment. */
export async function Greeting({ actor }: { actor: Actor }) {
  const result = await loadProfile(actor);
  const first =
    result.status === "ok"
      ? result.value.fullName.trim().split(/\s+/)[0]
      : undefined;
  return (
    <h1 className="font-display truncate text-2xl leading-none">
      {first ? (
        <>
          Welcome back, <em className="text-brand">{first}</em>
        </>
      ) : (
        "Welcome back"
      )}
    </h1>
  );
}

/** Completeness. */
export async function Completeness({ actor }: { actor: Actor }) {
  const result = await loadProfile(actor);
  if (result.status === "error") return <BlockError what="your profile" />;
  return (
    <CompletenessCard
      {...profileCompleteness(result.status === "ok" ? result.value : null)}
    />
  );
}

const BLOCKS = [Completeness, Attention, Events, Jobs, RoleBlock];

/** The home page's right rail (≥xl): every block streams on its own. */
export function Widgets({ actor }: { actor: Actor }) {
  return BLOCKS.map((Block, i) => (
    <Suspense key={i} fallback={<BlockSkeleton rows={2} />}>
      <Block actor={actor} />
    </Suspense>
  ));
}

/**
 * The same blocks below xl, above the feed: a swipeable snap row on phones (scroll-padding keeps each card off
 * the screen edge), a 2- then 3-column grid from sm up. Each card shows at most two list rows so the feed
 * stays near the top.
 */
export function WidgetStrip({ actor }: { actor: Actor }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 scrollbar-none items-stretch gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&_li:nth-child(n+3)]:hidden">
      {BLOCKS.map((Block, i) => (
        <div
          key={i}
          className="w-[85%] max-w-80 min-w-0 shrink-0 snap-start *:h-full empty:hidden sm:w-auto sm:max-w-none"
        >
          <Suspense fallback={<BlockSkeleton rows={2} />}>
            <Block actor={actor} />
          </Suspense>
        </div>
      ))}
    </div>
  );
}

export async function Attention({ actor }: { actor: Actor }) {
  const { counts, failed } = await loadCounts(actor);
  return (
    <>
      <AttentionTiles counts={counts} />
      {failed && <BlockError what="some of what needs your attention" />}
    </>
  );
}

export async function Jobs({ actor }: { actor: Actor }) {
  const result = await loadJobs(actor);
  if (result.status === "absent") return null;
  if (result.status === "error") return <BlockError what="opportunities" />;
  return <JobList jobs={result.value.data} />;
}

export async function Events({ actor }: { actor: Actor }) {
  const result = await loadEvents(actor);
  if (result.status === "absent") return null;
  if (result.status === "error") return <BlockError what="events" />;
  return <EventList events={result.value.data} />;
}

/**
 * Mentors see their mentees; members who may request mentorship see suggested mentors; others see
 * nothing (the feed is the page itself). A denied branch falls through to the next one, never to an
 * error.
 */
export async function RoleBlock({ actor }: { actor: Actor }) {
  const mentor = await loadMentorProfile(actor);
  if (mentor.status === "ok" && mentor.value) {
    const result = await loadBlock(() =>
      listMentorships({
        actor,
        role: "mentor",
        states: ["ACCEPTED", "ACTIVE"],
        limit: 3,
      })
    );
    if (result.status === "error") return <BlockError what="your mentees" />;
    if (result.status === "ok") {
      return (
        <PeopleList
          title="Your mentees"
          href="/mentorship?tab=mentees"
          empty="No active mentees yet."
          people={result.value.data.map((m) => ({
            id: m.counterparty.id,
            name: m.counterparty.fullName,
            detail: m.topic ?? "Mentorship",
          }))}
        />
      );
    }
  }

  if (can(actor, PERMISSIONS.MENTORSHIP_REQUEST)) {
    const result = await loadBlock(async () => {
      const own = await loadProfile(actor);
      const name = own.status === "ok" ? own.value.department : null;
      // listMentors filters by department code; the profile carries the department's name.
      const code = name
        ? (await listDepartments()).find((d) => d.name === name)?.code
        : undefined;
      const same = code
        ? (await listMentors({ actor, department: code, limit: 3 })).data
        : [];
      if (same.length > 0) {
        return same.map((m) => ({
          id: m.userId,
          name: m.fullName,
          detail: "Same department",
        }));
      }
      return (await listMentors({ actor, limit: 3 })).data.map((m) => ({
        id: m.userId,
        name: m.fullName,
        detail: m.headline ?? m.expertise,
      }));
    });
    if (result.status === "error")
      return <BlockError what="mentor suggestions" />;
    if (result.status === "ok") {
      return (
        <PeopleList
          title="Mentors you might like"
          href="/mentorship?tab=find"
          empty="No mentors are taking requests right now."
          people={result.value}
        />
      );
    }
  }

  return null;
}

/** Only when the profile is incomplete and the attention, jobs and events blocks are all empty. */
export async function FirstRun({ actor }: { actor: Actor }) {
  const [profile, jobs, events, attention] = await Promise.all([
    loadProfile(actor),
    loadJobs(actor),
    loadEvents(actor),
    loadCounts(actor),
  ]);
  const record = profile.status === "ok" ? profile.value : null;
  if (profileCompleteness(record).percent >= 100) return null;
  if (jobs.status === "ok" && jobs.value.data.length > 0) return null;
  if (events.status === "ok" && events.value.data.length > 0) return null;
  // A failed count is unknown, not zero — never claim "nothing to do" over an error.
  if (attention.failed) return null;
  if (Object.values(attention.counts).some((n) => n > 0)) return null;
  return <Guidance batch={record?.graduationYear ?? null} />;
}
