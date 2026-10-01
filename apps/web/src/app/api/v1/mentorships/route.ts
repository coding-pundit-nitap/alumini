import { z } from "zod";

import { listMentorships, requestMentorship } from "@/composition/mentorship";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { MENTORSHIP_STATES } from "@/modules/mentorship";
import { parseJson, readBodyText } from "../_lib/request";

// Only the envelope is parsed here; the use case validates `message` and `topic` (and rejects extras).
const envelope = z.object({ mentorId: z.uuid() }).passthrough();

/** POST /api/v1/mentorships — ask a mentor (FR-MENTOR-004). Honours `Idempotency-Key` (API spec §1.6). */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await readBodyText(request);
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const body = parseJson(rawBody);
      const parsed = envelope.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError({
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join(".") || "(body)",
            code: "INVALID",
            message: issue.message,
          })),
        });
      }

      const { mentorId, ...input } = parsed.data;
      const { mentorshipId } = await requestMentorship({
        actor,
        mentorId,
        input,
      });
      return {
        status: 201,
        body: { data: { id: mentorshipId, state: "REQUESTED" } },
        headers: { Location: `/api/v1/mentorships/${mentorshipId}` },
      };
    },
  });
});

const listQuery = z.object({
  role: z.enum(["mentor", "mentee"]),
  state: z.array(z.enum(MENTORSHIP_STATES)).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/mentorships?role=&state=&limit=&cursor= — the caller's own list; `state` repeats. */
export const GET = routeHandler(async (request) => {
  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse({
    role: params.get("role") ?? undefined,
    state: params.has("state") ? params.getAll("state") : undefined,
    limit: params.get("limit") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(query)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }
  const { role, state, limit, cursor } = parsed.data;
  const result = await listMentorships({
    actor: await getActor(),
    role,
    states: state,
    limit,
    cursor,
  });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
