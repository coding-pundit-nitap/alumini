"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  addParticipant,
  createDirectConversation,
  createGroupConversation,
  removeParticipant,
} from "@/composition/messaging";
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
          message: "That member or conversation was not found.",
        },
      ],
    });
  }
  return value;
}

/** The "Message" button on a profile. */
export async function startConversationAction(
  recipientId: string
): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(async () => {
    const { conversationId } = await createDirectConversation({
      actor: await getActor(),
      recipientId: parseId("recipientId", recipientId),
    });
    return { conversationId };
  });
}

export async function createGroupAction(input: {
  title?: string;
  memberIds: string[];
}): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(async () => {
    const { conversationId } = await createGroupConversation({
      actor: await getActor(),
      input,
    });
    return { conversationId };
  });
}

export async function addParticipantAction(
  conversationId: string,
  userId: string
): Promise<ActionResult<{ added: boolean }>> {
  return runAction(async () =>
    addParticipant({
      actor: await getActor(),
      conversationId: parseId("conversationId", conversationId),
      userId: parseId("userId", userId),
    })
  );
}

export async function removeParticipantAction(
  conversationId: string,
  userId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await removeParticipant({
      actor: await getActor(),
      conversationId: parseId("conversationId", conversationId),
      userId: parseId("userId", userId),
    });
    return {};
  });
}
