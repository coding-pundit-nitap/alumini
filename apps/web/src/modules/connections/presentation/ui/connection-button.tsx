"use client";

import { Button } from "@nitap/ui/components/button";
import { useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { ConnectionStatus } from "../../domain/connection";
import { useConnectionAction } from "./use-connection-action";

type Act = Promise<ActionResult<unknown>>;

/**
 * The server computes `status` from the viewer's side; every action is
 * re-checked on the server.
 */
export function ConnectionButton({
  targetUserId,
  status,
  requestAction,
  respondAction,
  removeAction,
  blockAction,
}: {
  targetUserId: string;
  status: ConnectionStatus;
  requestAction: (recipientId: string) => Act;
  respondAction: (connectionId: string, decision: "ACCEPT" | "REJECT") => Act;
  removeAction: (connectionId: string) => Act;
  blockAction: (userId: string) => Act;
}) {
  const { pending, error, run } = useConnectionAction();
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const primary = (() => {
    switch (status.state) {
      case "NONE":
        return (
          <Button
            size="sm"
            className="rounded-full"
            disabled={pending}
            onClick={() => run(() => requestAction(targetUserId))}
          >
            Connect
          </Button>
        );
      case "OUTGOING":
        return (
          <>
            <span className="text-muted-foreground bg-muted rounded-full px-3 py-1 text-xs font-medium">
              Request sent
            </span>
            <Button
              size="sm"
              className="rounded-full"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => removeAction(status.connectionId))}
            >
              Cancel request
            </Button>
          </>
        );
      case "INCOMING":
        return (
          <>
            <Button
              size="sm"
              className="rounded-full"
              disabled={pending}
              onClick={() =>
                run(() => respondAction(status.connectionId, "ACCEPT"))
              }
            >
              Accept
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => respondAction(status.connectionId, "REJECT"))
              }
            >
              Decline
            </Button>
          </>
        );
      case "CONNECTED":
        return (
          <>
            <span className="bg-success/10 text-success rounded-full px-3 py-1 text-xs font-medium">
              Connected
            </span>
            <Button
              size="sm"
              className="rounded-full"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => removeAction(status.connectionId))}
            >
              Remove connection
            </Button>
          </>
        );
      case "BLOCKED_BY_ME":
        return (
          <Button
            size="sm"
            className="rounded-full"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => removeAction(status.connectionId))}
          >
            Unblock
          </Button>
        );
    }
  })();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {primary}
        {status.state !== "BLOCKED_BY_ME" ? (
          confirmingBlock ? (
            <>
              <Button
                size="sm"
                className="rounded-full"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => blockAction(targetUserId))}
              >
                Confirm block
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => setConfirmingBlock(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive rounded-full"
              onClick={() => setConfirmingBlock(true)}
            >
              Block
            </Button>
          )
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
