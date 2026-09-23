import { createJob } from "@/composition/jobs";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

/** POST /api/v1/jobs — create/submit a job (FR-JOB-001). Honours `Idempotency-Key` (spec J-16). */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await request.text();
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const input = (() => {
        try {
          return JSON.parse(rawBody) as unknown;
        } catch {
          throw new ValidationError({ code: "MALFORMED_REQUEST" });
        }
      })();
      const { jobId, status } = await createJob({ actor, input });
      return {
        status: 201,
        body: { data: { id: jobId, status } },
        headers: { Location: `/api/v1/jobs/${jobId}` },
      };
    },
  });
});
