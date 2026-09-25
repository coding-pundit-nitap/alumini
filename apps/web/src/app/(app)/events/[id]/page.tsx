import {
  ArrowLeft,
  CalendarClock,
  Clock,
  MapPin,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { getEvent, listRegistrants } from "@/composition/events";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import {
  DateBlock,
  EventBadges,
  formatEventTime,
  OrganizerPanel,
  RegistrationButton,
  SpotsMeter,
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

  const cancelled = event.status === "CANCELLED";
  return (
    <PageColumns
      header={
        <Link
          href="/events"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 rounded-full",
          })}
        >
          <ArrowLeft aria-hidden />
          Events
        </Link>
      }
    >
      <article>
        <header className="flex gap-4 border-b px-4 py-6 sm:px-5">
          <DateBlock
            startsAt={event.startsAt}
            timezone={event.timezone}
            size="lg"
            muted={cancelled}
          />
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {event.title}
            </h1>
            <EventBadges event={event} />
          </div>
        </header>

        <dl className="space-y-3 border-b px-4 py-5 text-sm sm:px-5">
          <Row icon={Clock} label="When">
            <time dateTime={event.startsAt.toISOString()}>
              {formatEventTime(event.startsAt, event.timezone)}
            </time>
          </Row>
          <Row icon={CalendarClock} label="Registration closes">
            <time dateTime={event.registrationDeadline.toISOString()}>
              {formatEventTime(event.registrationDeadline, event.timezone)}
            </time>
          </Row>
          <Row icon={event.isOnline ? Video : MapPin} label="Where">
            {event.isOnline ? "Online" : event.location}
          </Row>
          <Row icon={Users} label="Spots">
            <SpotsMeter
              remaining={event.spotsRemaining}
              capacity={event.capacity}
            />
          </Row>
          <Row icon={UserRound} label="Organizer">
            {event.organizer.name}
          </Row>
        </dl>

        <div className="border-b px-4 py-5 sm:px-5">
          <RegistrationButton
            event={event}
            registerAction={registerForEventAction}
            cancelAction={cancelRegistrationAction}
          />
        </div>

        <section className="space-y-2 border-b px-4 py-6 sm:px-5">
          <h2 className="font-semibold tracking-tight">About this event</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        </section>

        {event.canManage ? (
          <section className="px-4 py-6 sm:px-5">
            <OrganizerPanel
              event={event}
              registrants={registrants}
              cancelEventAction={cancelEventAction}
              markAttendanceAction={markAttendanceAction}
            />
          </section>
        ) : null}
      </article>
    </PageColumns>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        aria-hidden
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 sm:flex sm:flex-1 sm:gap-3">
        <dt className="text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
        <dd className="min-w-0">{children}</dd>
      </div>
    </div>
  );
}
