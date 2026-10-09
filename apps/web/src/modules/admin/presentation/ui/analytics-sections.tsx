import type { ReactNode } from "react";

import type {
  AnalyticsSection,
  CommunityData,
  DonationsData,
  EventsData,
  JobsData,
  MembersData,
  SectionKey,
} from "../../domain/analytics";
import { BarBreakdown } from "./bar-breakdown";
import { BarSeries } from "./bar-series";
import { STATE_LABEL } from "./labels";

export const SECTION_COPY: Record<
  SectionKey,
  { title: string; description: string }
> = {
  members: {
    title: "Members",
    description:
      "Sign-ups, who is verified, and how fast requests are decided.",
  },
  jobs: {
    title: "Jobs",
    description:
      "What was submitted, how it was decided, and what is open now.",
  },
  events: {
    title: "Events",
    description: "Events held in the period and how full they were.",
  },
  community: {
    title: "Community",
    description: "Feed activity and reports filed.",
  },
  donations: {
    title: "Donations",
    description: "Money confirmed as received, and who gave.",
  },
};

/**
 * "FULL_TIME" → "Full time": enum keys and role names come from the database,
 * not from code.
 */
const humanize = (key: string) =>
  key.charAt(0) + key.slice(1).toLowerCase().replaceAll("_", " ");

const number = (n: number) => n.toLocaleString("en-IN");

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const Stats = ({ children }: { children: ReactNode }) => (
  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</dl>
);

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-6 md:grid-cols-2">{children}</div>
);

function Members({ data }: { data: MembersData }) {
  const v = data.verification;
  return (
    <>
      <Stats>
        <Stat label="Verified" value={number(data.byState.VERIFIED ?? 0)} />
        <Stat label="Pending" value={number(data.byState.PENDING ?? 0)} />
        <Stat
          label="Requests approved / rejected"
          value={`${number(v.approved)} / ${number(v.rejected)}`}
        />
        <Stat
          label="Median time to decide"
          value={
            v.medianHoursToReview === null
              ? "—"
              : `${v.medianHoursToReview.toFixed(1)} h`
          }
        />
      </Stats>
      <BarSeries label="New sign-ups" points={data.signups} />
      <Grid>
        <BarBreakdown
          label="Verified members by role"
          buckets={data.byRole}
          labelOf={humanize}
        />
        <BarBreakdown
          label="Verified alumni by graduation year"
          buckets={data.byGraduationYear}
        />
      </Grid>
      <BarBreakdown
        label="All accounts by state"
        buckets={Object.entries(data.byState).map(([key, value]) => ({
          key,
          count: value,
        }))}
        labelOf={(k) => STATE_LABEL[k] ?? humanize(k)}
      />
    </>
  );
}

function Jobs({ data }: { data: JobsData }) {
  return (
    <>
      <BarSeries label="Jobs submitted" points={data.submitted} />
      <Grid>
        <BarBreakdown
          label="Submitted in the period, by current status"
          buckets={data.byStatus}
          labelOf={humanize}
        />
        <BarBreakdown
          label="Open now, by employment type"
          buckets={data.openByEmploymentType}
          labelOf={humanize}
        />
      </Grid>
    </>
  );
}

function Events({ data }: { data: EventsData }) {
  return (
    <Stats>
      <Stat label="Held" value={number(data.held)} />
      <Stat label="Cancelled" value={number(data.cancelled)} />
      <Stat label="Registrations" value={number(data.registrations)} />
      <Stat
        label="Average fill rate"
        value={
          data.averageFillRate === null
            ? "—"
            : `${Math.round(data.averageFillRate * 100)} %`
        }
      />
      <Stat label="Upcoming" value={number(data.upcoming)} />
    </Stats>
  );
}

function Community({ data }: { data: CommunityData }) {
  return (
    <>
      <Grid>
        <BarSeries label="Posts" points={data.posts} />
        <BarSeries label="Comments" points={data.comments} />
      </Grid>
      <BarBreakdown
        label="Reports filed, by current status"
        buckets={data.reportsByStatus}
        labelOf={humanize}
      />
    </>
  );
}

function Donations({ data }: { data: DonationsData }) {
  const rupees = (paise: number) =>
    `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
  return (
    <>
      <Stats>
        <Stat label="Received" value={rupees(data.raisedPaise)} />
        <Stat label="Donors" value={number(data.donors)} />
      </Stats>
      <BarSeries label="Received per week (₹)" points={data.receivedRupees} />
      <BarBreakdown
        label="Donors by campaign"
        buckets={data.donorsByCampaign}
      />
    </>
  );
}

/** A section's content; a failed section says so in place and the rest render. */
export function AnalyticsSectionBody({
  section,
}: {
  section: AnalyticsSection;
}) {
  if (section.status === "unavailable")
    return (
      <p className="text-muted-foreground text-sm">
        Unavailable right now. The other sections are unaffected; try again
        shortly.
      </p>
    );
  switch (section.key) {
    case "members":
      return <Members data={section.data} />;
    case "jobs":
      return <Jobs data={section.data} />;
    case "events":
      return <Events data={section.data} />;
    case "community":
      return <Community data={section.data} />;
    case "donations":
      return <Donations data={section.data} />;
  }
}
