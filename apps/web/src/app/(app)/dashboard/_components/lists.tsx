import Link from "next/link";

function Block({
  title,
  href,
  more,
  children,
}: {
  title: string;
  href: string;
  more: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
      <Link href={href} className="text-sm underline">
        {more}
      </Link>
    </section>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="text-muted-foreground text-sm">{text}</p>
);

export function JobList({
  jobs,
}: {
  jobs: {
    id: string;
    title: string;
    company: string;
    location: string | null;
  }[];
}) {
  return (
    <Block title="Opportunities for you" href="/jobs" more="See all jobs">
      {jobs.length === 0 ? (
        <Empty text="No open roles right now." />
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="font-medium hover:underline"
              >
                {job.title}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                — {job.company}
                {job.location ? ` · ${job.location}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

export function EventList({
  events,
}: {
  events: {
    id: string;
    title: string;
    startsAt: Date;
    timezone: string;
    isOnline: boolean;
    location: string | null;
  }[];
}) {
  return (
    <Block title="Upcoming events" href="/events" more="See all events">
      {events.length === 0 ? (
        <Empty text="No upcoming events yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3">
              <time
                dateTime={event.startsAt.toISOString()}
                className="text-muted-foreground w-16 shrink-0 tabular-nums"
              >
                {event.startsAt.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  timeZone: event.timezone,
                })}
              </time>
              <Link
                href={`/events/${event.id}`}
                className="font-medium hover:underline"
              >
                {event.isOnline ? "Online: " : ""}
                {event.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

export function PeopleList({
  title,
  people,
  href,
  empty,
}: {
  title: string;
  people: { id: string; name: string; detail: string }[];
  href: string;
  empty: string;
}) {
  return (
    <Block title={title} href={href} more="See more">
      {people.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/members/${p.id}`}
                className="font-medium hover:underline"
              >
                {p.name}
              </Link>
              <span className="text-muted-foreground"> — {p.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}
