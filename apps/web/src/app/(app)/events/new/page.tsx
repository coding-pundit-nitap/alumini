import { PERMISSIONS } from "@nitap/database/permissions";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { can, getActor } from "@/modules/auth";
import { EventForm } from "@/modules/events";

import { createEventAction } from "../actions";

export const metadata: Metadata = { title: "Create event" };

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fevents%2Fnew");
  if (!can(actor, PERMISSIONS.EVENT_CREATE)) redirect("/events");

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
      <div className="space-y-1 border-b px-4 py-6 sm:px-5">
        <h1 className="text-2xl font-semibold tracking-tight">Create event</h1>
        <p className="text-muted-foreground text-sm">
          Members can register as soon as you publish. Times are in the zone you
          pick.
        </p>
      </div>
      <div className="px-4 py-6 sm:px-5">
        <EventForm createAction={createEventAction} />
      </div>
    </PageColumns>
  );
}
