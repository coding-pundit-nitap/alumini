import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getEvent } from "@/composition/events";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { EventBadges, formatEventTime, spotsLabel } from "@/modules/events";

export const metadata: Metadata = { title: "Event" };

const uuid = z.uuid();

/** Read-only event detail (slice 8a). */
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
  if (!uuid.safeParse(id).success) notFound();

  let event;
  try {
    event = await getEvent({ actor, eventId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <Link href="/events" className="text-muted-foreground text-sm">
        ← All events
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <EventBadges event={event} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">When</dt>
        <dd>
          <time dateTime={event.startsAt.toISOString()}>
            {formatEventTime(event.startsAt, event.timezone)}
          </time>
        </dd>
        <dt className="text-muted-foreground">Registration closes</dt>
        <dd>
          <time dateTime={event.registrationDeadline.toISOString()}>
            {formatEventTime(event.registrationDeadline, event.timezone)}
          </time>
        </dd>
        <dt className="text-muted-foreground">Where</dt>
        <dd>{event.isOnline ? "Online" : event.location}</dd>
        <dt className="text-muted-foreground">Spots</dt>
        <dd>{spotsLabel(event.spotsRemaining, event.capacity)}</dd>
        <dt className="text-muted-foreground">Organizer</dt>
        <dd>{event.organizer.name}</dd>
      </dl>
      {/* Slice 8b adds the Register / Cancel registration button here; slice 8c the organizer panel. */}
      <p className="text-sm whitespace-pre-wrap">{event.description}</p>
    </div>
  );
}
