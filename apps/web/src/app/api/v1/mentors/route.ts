import { z } from "zod";

import { listMentors } from "@/composition/mentorship";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const query = z.object({
  topic: z.string().max(40).optional(),
  department: z.string().max(20).optional(),
  company: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().max(300).optional(),
});

/** GET /api/v1/mentors — available mentors this member may see (FR-MENTOR-003). */
export const GET = routeHandler(async (request) => {
  const parsed = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((i) => ({
        field: i.path.join(".") || "(query)",
        code: "INVALID",
        message: i.message,
      })),
    });
  }
  const page = await listMentors({ actor: await getActor(), ...parsed.data });
  return Response.json(page, {
    headers: { "Cache-Control": "private, no-store" },
  });
});
