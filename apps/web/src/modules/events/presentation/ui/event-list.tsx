import { Calendar, Clock } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@nitap/ui/components/button";
import { cn } from "@nitap/ui/lib/utils";

import type { EventSummary } from "../../application/event-queries";
import { formatEventTime } from "../format";
import { EventBadges } from "./event-badges";
import { DateBlock, EventPlace, SpotsMeter } from "./event-parts";

/** The `/events` list (spec "UI"). Server-renderable: no hooks, no client state. */
export function EventList({
  events,
  loadMoreHref,
  canCreate = false,
}: {
  events: EventSummary[];
  loadMoreHref: string | null;
  /** Offers "Create event" on the empty state. */
  canCreate?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Calendar aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">No events here yet</p>
          <p className="text-muted-foreground text-sm">
            Check back later for new events.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/events/new"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            Create event
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-border divide-y">
        {events.map((event) => {
          const cancelled = event.status === "CANCELLED";
          return (
            <li
              key={event.id}
              className="group hover:bg-muted/30 relative flex gap-4 px-4 py-4 transition-colors sm:px-5"
            >
              <DateBlock
                startsAt={event.startsAt}
                timezone={event.timezone}
                muted={cancelled}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2
                  className={cn(
                    "leading-snug font-medium",
                    cancelled && "text-muted-foreground line-through"
                  )}
                >
                  {/* The stretched link makes the whole row open the event. */}
                  <Link
                    href={`/events/${event.id}`}
                    className="underline-offset-2 outline-none group-hover:underline after:absolute after:inset-0 focus-visible:underline"
                  >
                    {event.title}
                  </Link>
                </h2>
                <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Clock aria-hidden className="size-3.5 shrink-0" />
                    <time dateTime={event.startsAt.toISOString()}>
                      {formatEventTime(event.startsAt, event.timezone)}
                    </time>
                  </span>
                  <EventPlace
                    isOnline={event.isOnline}
                    location={event.location}
                  />
                </p>
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                  <SpotsMeter
                    remaining={event.spotsRemaining}
                    capacity={event.capacity}
                  />
                  <EventBadges event={event} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {loadMoreHref ? (
        <div className="flex justify-center border-t py-4">
          <Link
            href={loadMoreHref}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "text-muted-foreground rounded-full",
            })}
          >
            Load more
          </Link>
        </div>
      ) : null}
    </div>
  );
}
