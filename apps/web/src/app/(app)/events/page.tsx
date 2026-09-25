import { PERMISSIONS } from "@nitap/database/permissions";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { PageColumns } from "@/components/shell/page-columns";
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
  const canCreate = can(actor, PERMISSIONS.EVENT_CREATE);
  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">Events</h1>
            <p className="text-muted-foreground truncate text-xs">
              Reunions, talks and meetups from the NIT AP community
            </p>
          </div>
          {canCreate ? (
            <Link
              href="/events/new"
              className={buttonVariants({
                size: "sm",
                className: "rounded-full",
              })}
            >
              <Plus aria-hidden />
              Create event
            </Link>
          ) : null}
        </>
      }
    >
      <nav
        aria-label="Events"
        className="scrollbar-none overflow-x-auto border-b px-4 py-3 sm:px-5"
      >
        <Segmented>
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <Link
              key={t}
              href={`/events?tab=${t}`}
              aria-current={t === tab ? "page" : undefined}
              className={segmentedItemVariants({ active: t === tab })}
            >
              {TABS[t]}
            </Link>
          ))}
        </Segmented>
      </nav>
      <EventList
        events={page.data}
        canCreate={canCreate}
        loadMoreHref={
          next ? `/events?tab=${tab}&cursor=${encodeURIComponent(next)}` : null
        }
      />
    </PageColumns>
  );
}
