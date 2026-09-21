"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  blockUser,
  removeConnection,
  requestConnection,
  respondToConnection,
} from "@/composition/connections";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseId(field: string, value: string): string {
  if (!UUID.test(value)) {
    throw new ValidationError({
      details: [
        {
          field,
          code: "INVALID",
          message: "That member or request was not found.",
        },
      ],
    });
  }
  return value;
}

/**
 * Connection Server Actions (FR-NET). Plain-value arguments, called from client buttons; each use case
 * authorizes and validates again, and the page re-renders afterwards.
 */
export async function requestConnectionAction(
  recipientId: string
): Promise<ActionResult<{ connectionId: string }>> {
  return runAction(async () => {
    const result = await requestConnection({
      actor: await getActor(),
      recipientId: parseId("recipientId", recipientId),
    });
    refresh();
    return result;
  });
}

export async function respondToConnectionAction(
  connectionId: string,
  decision: "ACCEPT" | "REJECT"
): Promise<ActionResult<{ state: "ACCEPTED" | "REJECTED" }>> {
  return runAction(async () => {
    if (decision !== "ACCEPT" && decision !== "REJECT") {
      throw new ValidationError();
    }
    const result = await respondToConnection({
      actor: await getActor(),
      connectionId: parseId("connectionId", connectionId),
      decision,
    });
    refresh();
    return result;
  });
}

export async function removeConnectionAction(
  connectionId: string
): Promise<ActionResult<{ outcome: "cancelled" | "removed" | "unblocked" }>> {
  return runAction(async () => {
    const result = await removeConnection({
      actor: await getActor(),
      connectionId: parseId("connectionId", connectionId),
    });
    refresh();
    return result;
  });
}

export async function blockUserAction(
  userId: string
): Promise<ActionResult<{ connectionId: string }>> {
  return runAction(async () => {
    const result = await blockUser({
      actor: await getActor(),
      targetUserId: parseId("userId", userId),
    });
    refresh();
    return result;
  });
}
