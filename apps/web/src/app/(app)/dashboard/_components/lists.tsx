import Link from "next/link";

/** The shared highlights-rail shell: hairline card, small header row, optional "See all". */
export function Block({
  title,
  href,
  more,
  children,
}: {
  title: React.ReactNode;
  href?: string;
  more?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href ? (
          <Link
            href={href}
            aria-label={more}
            className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
          >
            See all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="text-muted-foreground py-2 text-sm">{text}</p>
);

const Rows = ({ children }: { children: React.ReactNode }) => (
  <ul className="divide-y">{children}</ul>
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
        <Rows>
          {jobs.map((job) => (
            <li key={job.id} className="py-2 text-sm">
              <Link
                href={`/jobs/${job.id}`}
                className="block truncate font-medium hover:underline"
              >
                {job.title}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {job.company}
                {job.location ? `, ${job.location}` : ""}
              </p>
            </li>
          ))}
        </Rows>
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
        <Rows>
          {events.map((event) => (
            <li key={event.id} className="flex gap-3 py-2 text-sm">
              <time
                dateTime={event.startsAt.toISOString()}
                className="text-brand w-12 shrink-0 text-xs leading-5 font-medium tabular-nums"
              >
                {event.startsAt.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  timeZone: event.timezone,
                })}
              </time>
              <Link
                href={`/events/${event.id}`}
                className="min-w-0 font-medium hover:underline"
              >
                {event.isOnline ? "Online: " : ""}
                {event.title}
              </Link>
            </li>
          ))}
        </Rows>
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
    <Block title={title} href={href} more={`See all: ${title}`}>
      {people.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <Rows>
          {people.map((p) => (
            <li key={p.id} className="py-2 text-sm">
              <Link
                href={`/members/${p.id}`}
                className="block truncate font-medium hover:underline"
              >
                {p.name}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {p.detail}
              </p>
            </li>
          ))}
        </Rows>
      )}
    </Block>
  );
}
