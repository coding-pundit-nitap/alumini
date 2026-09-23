import { PERMISSIONS } from "@nitap/database/permissions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { can, getActor } from "@/modules/auth";
import { EventForm } from "@/modules/events";

import { createEventAction } from "../actions";

export const metadata: Metadata = { title: "Create event" };

export default async function NewEventPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fevents%2Fnew");
  if (!can(actor, PERMISSIONS.EVENT_CREATE)) redirect("/events");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Create event</h1>
      <EventForm createAction={createEventAction} />
    </div>
  );
}
