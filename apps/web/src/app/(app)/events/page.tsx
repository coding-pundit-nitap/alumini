import { PERMISSIONS } from "@nitap/database/permissions";
import { buttonVariants } from "@nitap/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listEvents } from "@/composition/events";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import { EventList } from "@/modules/events";

export const metadata: Metadata = { title: "Events" };

const TABS = { upcoming: "Upcoming", mine: "My events", past: "Past" };
type Tab = keyof typeof TABS;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const { tab: rawTab, cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fevents");

  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "upcoming";

  let page;
  try {
    page = await listEvents({ actor, scope: tab, cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect(`/events?tab=${tab}`);
    }
    throw error;
  }

  const next = page.page.nextCursor;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Events</h1>
        {can(actor, PERMISSIONS.EVENT_CREATE) ? (
          <Link href="/events/new" className={buttonVariants()}>
            Create event
          </Link>
        ) : null}
      </div>
      <nav aria-label="Events" className="flex flex-wrap gap-4 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/events?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={
              t === tab ? "font-semibold underline" : "text-muted-foreground"
            }
          >
            {TABS[t]}
          </Link>
        ))}
      </nav>
      <EventList
        events={page.data}
        loadMoreHref={
          next ? `/events?tab=${tab}&cursor=${encodeURIComponent(next)}` : null
        }
      />
    </div>
  );
}
