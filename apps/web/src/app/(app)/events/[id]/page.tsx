import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getEvent, listRegistrants } from "@/composition/events";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import {
  EventBadges,
  formatEventTime,
  OrganizerPanel,
  RegistrationButton,
  spotsLabel,
} from "@/modules/events";

import {
  cancelEventAction,
  cancelRegistrationAction,
  markAttendanceAction,
  registerForEventAction,
} from "../actions";

export const metadata: Metadata = { title: "Event" };

const uuid = z.uuid();

/** Event detail, with the register / cancel registration button (slice 8b). */
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

  const registrants = event.canManage
    ? (await listRegistrants({ actor, eventId: id })).data
    : [];

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
      <RegistrationButton
        event={event}
        registerAction={registerForEventAction}
        cancelAction={cancelRegistrationAction}
      />
      {event.canManage ? (
        <OrganizerPanel
          event={event}
          registrants={registrants}
          cancelEventAction={cancelEventAction}
          markAttendanceAction={markAttendanceAction}
        />
      ) : null}
      <p className="text-sm whitespace-pre-wrap">{event.description}</p>
    </div>
  );
}
