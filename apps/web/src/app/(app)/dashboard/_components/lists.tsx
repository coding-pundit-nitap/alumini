import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** The shared highlights-rail shell: a hairline card in the mobile strip, an open section in the xl rail. */
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
    <section className="bg-card rounded-xl border p-4 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {href ? (
          <Link
            href={href}
            aria-label={more}
            className="text-muted-foreground hover:text-foreground group/more flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
          >
            See all
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-hover/more:translate-x-0.5"
            />
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
  <ul className="-mx-2 flex flex-col">{children}</ul>
);

const ROW =
  "hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150";

const Monogram = ({ text }: { text: string }) => (
  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold uppercase">
    {text.trim().slice(0, 2)}
  </span>
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
            <li key={job.id}>
              <Link href={`/jobs/${job.id}`} className={ROW}>
                <Monogram text={job.company} />
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">
                    {job.title}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                  </span>
                </span>
              </Link>
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
            <li key={event.id}>
              <Link href={`/events/${event.id}`} className={ROW}>
                <time
                  dateTime={event.startsAt.toISOString()}
                  className="border-border bg-background flex w-10 shrink-0 flex-col items-center overflow-hidden rounded-lg border leading-none"
                >
                  <span className="bg-brand text-brand-foreground w-full py-0.5 text-center text-[9px] font-semibold tracking-wider uppercase">
                    {event.startsAt.toLocaleDateString("en-IN", {
                      month: "short",
                      timeZone: event.timezone,
                    })}
                  </span>
                  <span className="py-1 text-base font-semibold tabular-nums">
                    {event.startsAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      timeZone: event.timezone,
                    })}
                  </span>
                </time>
                <span className="min-w-0 text-sm">
                  <span className="line-clamp-2 font-medium">
                    {event.title}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {event.isOnline
                      ? "Online"
                      : (event.location ?? "In person")}
                  </span>
                </span>
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
            <li key={p.id}>
              <Link href={`/members/${p.id}`} className={ROW}>
                <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {p.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {p.detail}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </Rows>
      )}
    </Block>
  );
}
