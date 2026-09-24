import Link from "next/link";
import { cache } from "react";

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
import { listFeed } from "@/composition/posts";
import { getOwnProfile } from "@/composition/users";
import { can, PERMISSIONS, type Actor } from "@/modules/auth";
import { profileCompleteness } from "@/modules/users";

import { AttentionTiles, COUNT_CAP } from "./attention-tiles";
import { BlockError } from "./block-error";
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
 * H-8. ponytail: each count reads ≤ 50 rows and shows "50+" at the cap; add count queries if members
 * routinely exceed it (spec O-2).
 *
 * H-6: a real failure in one of the four reads must not read as "0 requests" with no signal — it's
 * excluded from its tile and `failed` tells `Attention` to render an inline error alongside whatever
 * tiles did load (spec Errors and states).
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

/** H-12 greeting and H-7 completeness. */
export async function ProfileHeader({ actor }: { actor: Actor }) {
  const result = await loadProfile(actor);
  const profile = result.status === "ok" ? result.value : null;
  const first = profile?.fullName.trim().split(/\s+/)[0];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {first ? `Welcome back, ${first}` : "Welcome back"}
      </h1>
      {result.status === "error" ? (
        <BlockError what="your profile" />
      ) : (
        <CompletenessCard {...profileCompleteness(profile)} />
      )}
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
 * H-10: mentors see their mentees; members who may request mentorship see suggested mentors; others see
 * the feed. A denied branch falls through to the next one, never to an error.
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

  const result = await loadBlock(() => listFeed({ actor, limit: 3 }));
  if (result.status === "absent") return null;
  if (result.status === "error") return <BlockError what="community posts" />;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Latest from the community</h2>
      {result.value.posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No posts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.value.posts.map((post) => (
            <li key={post.id} className="line-clamp-2 text-sm">
              <Link href={`/feed/${post.id}`} className="hover:underline">
                {post.content}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/feed" className="text-sm underline">
        See the feed
      </Link>
    </section>
  );
}

/** H-11: only when the profile is incomplete and the attention, jobs and events blocks are all empty. */
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
  // A failed count is unknown, not zero — never claim "nothing to do" over an error (H-6).
  if (attention.failed) return null;
  if (Object.values(attention.counts).some((n) => n > 0)) return null;
  return <Guidance batch={record?.graduationYear ?? null} />;
}
