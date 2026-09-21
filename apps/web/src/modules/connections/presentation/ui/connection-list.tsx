"use client";

import { Button } from "@nitap/ui/components/button";
import Link from "next/link";

import type { ActionResult } from "@/lib/action-result";

import type { ListedConnection } from "../../application/connection-store";
import { useConnectionAction } from "./use-connection-action";

type Act = Promise<ActionResult<unknown>>;

export type ConnectionTab = "connections" | "incoming" | "outgoing" | "blocked";

const EMPTY: Record<ConnectionTab, string> = {
  connections: "You have no connections yet. Find people in the directory.",
  incoming: "No requests waiting for you.",
  outgoing: "You have no pending requests.",
  blocked: "You have not blocked anyone.",
};

function Row({
  item,
  tab,
  respondAction,
  removeAction,
}: {
  item: ListedConnection;
  tab: ConnectionTab;
  respondAction: (connectionId: string, decision: "ACCEPT" | "REJECT") => Act;
  removeAction: (connectionId: string) => Act;
}) {
  const { pending, error, run } = useConnectionAction();
  return (
    <li className="space-y-1 p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3">
          {item.user.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
            <img
              src={`/api/photos/${item.user.id}`}
              alt=""
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="bg-muted flex size-10 items-center justify-center rounded-full font-medium"
            >
              {item.user.fullName.slice(0, 1).toUpperCase()}
            </span>
          )}
          {tab === "blocked" ? (
            <span className="truncate font-medium">{item.user.fullName}</span>
          ) : (
            <Link
              href={`/members/${item.user.id}`}
              className="truncate font-medium underline-offset-2 hover:underline"
            >
              {item.user.fullName}
            </Link>
          )}
        </span>
        <span className="flex shrink-0 gap-2">
          {tab === "incoming" ? (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => respondAction(item.id, "ACCEPT"))}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => respondAction(item.id, "REJECT"))}
              >
                Decline
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => removeAction(item.id))}
            >
              {
                {
                  connections: "Remove",
                  outgoing: "Cancel request",
                  blocked: "Unblock",
                  incoming: "",
                }[tab]
              }
            </Button>
          )}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** One list of the caller's connections, requests or blocks, with the one or two actions that fit its tab. */
export function ConnectionList({
  items,
  tab,
  respondAction,
  removeAction,
}: {
  items: ListedConnection[];
  tab: ConnectionTab;
  respondAction: (connectionId: string, decision: "ACCEPT" | "REJECT") => Act;
  removeAction: (connectionId: string) => Act;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">{EMPTY[tab]}</p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          tab={tab}
          respondAction={respondAction}
          removeAction={removeAction}
        />
      ))}
    </ul>
  );
}
