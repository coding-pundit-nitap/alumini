import { z } from "zod";

import { createJob, listMyJobs, listPublishedJobs } from "@/composition/jobs";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { respondIdempotently } from "@/infrastructure/idempotency";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { EMPLOYMENT_TYPES, WORK_MODES } from "@/modules/jobs";
import { parseJson, readBodyText } from "../_lib/request";

/** POST /api/v1/jobs — create/submit a job. Honours `Idempotency-Key`. */
export const POST = routeHandler(async (request) => {
  assertSameOrigin(request);
  const rawBody = await readBodyText(request);
  const actor = await getActor();

  return respondIdempotently(request, {
    userId: actor?.userId ?? null,
    rawBody,
    execute: async () => {
      const input = parseJson(rawBody);
      const { jobId, status } = await createJob({ actor, input });
      return {
        status: 201,
        body: { data: { id: jobId, status } },
        headers: { Location: `/api/v1/jobs/${jobId}` },
      };
    },
  });
});

const listQuery = z.object({
  mine: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  location: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(300).optional(),
});

/** GET /api/v1/jobs — the public listing, or `?mine=true` for the caller's own (any status). */
export const GET = routeHandler(async (request) => {
  const params = new URL(request.url).searchParams;
  const parsed = listQuery.safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(query)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }
  const actor = await getActor();
  const { mine, ...filter } = parsed.data;
  const result = mine
    ? await listMyJobs({ actor, limit: filter.limit, cursor: filter.cursor })
    : await listPublishedJobs({ actor, ...filter });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
