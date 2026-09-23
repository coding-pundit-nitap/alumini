import { buttonVariants } from "@nitap/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@nitap/ui/components/empty";
import { CalendarIcon } from "lucide-react";
import Link from "next/link";

import type { EventSummary } from "../../application/event-queries";
import { formatEventTime, spotsLabel } from "../format";
import { EventBadges } from "./event-badges";

/** The `/events` list (spec "UI"). Server-renderable: no hooks, no client state. */
export function EventList({
  events,
  loadMoreHref,
}: {
  events: EventSummary[];
  loadMoreHref: string | null;
}) {
  if (events.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarIcon />
          </EmptyMedia>
          <EmptyTitle>No events here yet</EmptyTitle>
          <EmptyDescription>Check back later for new events.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
        <Card key={event.id}>
          <CardHeader>
            <CardTitle>
              <Link href={`/events/${event.id}`} className="hover:underline">
                {event.title}
              </Link>
            </CardTitle>
            <CardDescription>
              <time dateTime={event.startsAt.toISOString()}>
                {formatEventTime(event.startsAt, event.timezone)}
              </time>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventBadges event={event} />
          </CardContent>
          <CardFooter className="text-muted-foreground">
            {spotsLabel(event.spotsRemaining, event.capacity)}
          </CardFooter>
        </Card>
      ))}
      {loadMoreHref ? (
        <Link
          href={loadMoreHref}
          className={buttonVariants({
            variant: "outline",
            className: "self-center",
          })}
        >
          Load more
        </Link>
      ) : null}
    </div>
  );
}
