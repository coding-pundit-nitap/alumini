import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
  try {
    page = await listConnections({ actor, ...QUERY[tab], cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect(`/connections?tab=${tab}`);
    }
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Your connections</h1>
      <nav
        aria-label="Connection lists"
        className="flex flex-wrap gap-4 text-sm"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/connections?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={
              t.id === tab ? "font-semibold underline" : "text-muted-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <ConnectionList
        items={page.data}
        tab={tab}
        respondAction={respondToConnectionAction}
        removeAction={removeConnectionAction}
      />
      {page.page.nextCursor ? (
        <Link
          href={`/connections?tab=${tab}&cursor=${encodeURIComponent(page.page.nextCursor)}`}
          className="text-primary block text-center text-sm underline"
        >
          Next page
        </Link>
      ) : null}
      <Link href="/directory" className="text-primary block text-sm underline">
        Find people in the directory
      </Link>
    </div>
  );
}
