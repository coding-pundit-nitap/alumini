"use server";

import { runAction } from "@/app/_actions/run-action";
import { createDirectConversation } from "@/composition/messaging";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The "Message" button on a profile. Plain-value argument; the use case authorizes and validates again. */
export async function startConversationAction(
  recipientId: string
): Promise<ActionResult<{ conversationId: string }>> {
  return runAction(async () => {
    if (!UUID.test(recipientId)) {
      throw new ValidationError({
        details: [
          {
            field: "recipientId",
            code: "INVALID",
            message: "That member was not found.",
          },
        ],
      });
    }
    const { conversationId } = await createDirectConversation({
      actor: await getActor(),
      recipientId,
    });
    return { conversationId };
  });
}
