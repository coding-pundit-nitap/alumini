import { z } from "zod";

import {
  createDirectConversation,
  createGroupConversation,
  listConversations,
} from "@/composition/messaging";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { getActor } from "@/modules/auth";

import { invalid, readJson } from "../_lib/request";

const directBody = z.object({ recipientId: z.uuid() }).strict();
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/**
 * POST /api/v1/conversations — start a 1:1 (`{ recipientId }`) or a group (`{
 * title?, memberIds }`).
 */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const actor = await getActor();

  const direct = directBody.safeParse(body);
  if (direct.success) {
    const { conversationId, created } = await createDirectConversation({
      actor,
      recipientId: direct.data.recipientId,
    });
    return Response.json(
      { data: { id: conversationId, isGroup: false } },
      {
        status: created ? 201 : 200,
        headers: { Location: `/api/v1/conversations/${conversationId}` },
      }
    );
  }
  // Not a direct body: it must be a group body; the use case validates it and its errors name the fields.
  if (typeof body !== "object" || body === null || !("memberIds" in body)) {
    throw invalid(direct.error);
  }
  const { conversationId } = await createGroupConversation({
    actor,
    input: body,
  });
  return Response.json(
    { data: { id: conversationId, isGroup: true } },
    {
      status: 201,
      headers: { Location: `/api/v1/conversations/${conversationId}` },
    }
  );
});

/** GET /api/v1/conversations — the caller's inbox. */
export const GET = routeHandler(async (request) => {
  const parsed = listQuery.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) throw invalid(parsed.error);
  const result = await listConversations({
    actor: await getActor(),
    ...parsed.data,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
