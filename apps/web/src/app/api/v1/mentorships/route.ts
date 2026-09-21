import { z } from "zod";

import { requestMentorship } from "@/composition/mentorship";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

// Only the envelope is parsed here; the use case validates `message` and `topic` (and rejects extras).
const envelope = z.object({ mentorId: z.uuid() }).passthrough();

/** POST /api/v1/mentorships — ask a mentor (FR-MENTOR-004). Honours `Idempotency-Key` (API spec §1.6). */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await request.text();
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const body = (() => {
        try {
          return JSON.parse(rawBody) as unknown;
        } catch {
          throw new ValidationError({ code: "MALFORMED_REQUEST" });
        }
      })();
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
