import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { startConversationAction } from "@/app/(app)/messages/actions";
import { PageColumns } from "@/components/shell/page-columns";
import { listConnections } from "@/composition/connections";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { ConnectionList, type ConnectionTab } from "@/modules/connections";

import { removeConnectionAction, respondToConnectionAction } from "./actions";

export const metadata: Metadata = { title: "Your connections" };

const TABS: { id: ConnectionTab; label: string }[] = [
  { id: "connections", label: "Connections" },
  { id: "incoming", label: "Requests for you" },
  { id: "outgoing", label: "Sent" },
  { id: "blocked", label: "Blocked" },
];

const QUERY = {
  connections: { state: "ACCEPTED" },
  incoming: { state: "PENDING", direction: "INCOMING" },
  outgoing: { state: "PENDING", direction: "OUTGOING" },
  blocked: { state: "BLOCKED" },
} as const;

/** The incoming badge reads at most this many; beyond it the exact number is unknown ("50+"). */
const BADGE_CAP = 50;

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const { tab: rawTab, cursor } = await searchParams;
  const tab = TABS.find((t) => t.id === rawTab)?.id ?? "connections";

  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fconnections");

  let page;
  let incoming: number;
  try {
    // One capped read feeds the Requests badge (the list itself pages at 20, so it can't be the count).
    [page, incoming] = await Promise.all([
      listConnections({ actor, ...QUERY[tab], cursor }),
      listConnections({ actor, ...QUERY.incoming, limit: BADGE_CAP }).then(
        (p) => p.data.length
      ),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect(`/connections?tab=${tab}`);
    }
    throw error;
  }
  const badge = incoming;

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Your connections
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              The people you know from NIT Arunachal Pradesh
            </p>
          </div>
          <Link
            href="/directory"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            <UserPlus aria-hidden />
            Find people
          </Link>
        </>
      }
    >
      <nav
        aria-label="Connection lists"
        className="scrollbar-none overflow-x-auto border-b px-4 py-3 sm:px-5"
      >
        <Segmented>
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/connections?tab=${t.id}`}
              aria-current={t.id === tab ? "page" : undefined}
              className={segmentedItemVariants({ active: t.id === tab })}
            >
              {t.label}
              {t.id === "incoming" && badge ? (
                <span
                  aria-label={`${badge >= BADGE_CAP ? `${BADGE_CAP}+` : badge} waiting`}
                  className="bg-brand text-brand-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
                >
                  {badge >= BADGE_CAP ? `${BADGE_CAP}+` : badge}
                </span>
              ) : null}
            </Link>
          ))}
        </Segmented>
      </nav>
      <ConnectionList
        key={tab}
        items={page.data}
        tab={tab}
        respondAction={respondToConnectionAction}
        removeAction={removeConnectionAction}
        messageAction={
          tab === "connections" ? startConversationAction : undefined
        }
        query={QUERY[tab]}
        nextCursor={page.page.nextCursor}
        nextHref={
          page.page.nextCursor
            ? `/connections?tab=${tab}&cursor=${encodeURIComponent(page.page.nextCursor)}`
            : null
        }
      />
    </PageColumns>
  );
}
