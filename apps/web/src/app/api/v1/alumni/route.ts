import { InvalidCursorError, parseDirectoryQuery } from "@nitap/search";

import { searchDirectory } from "@/composition/directory";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

/** GET /api/v1/alumni — directory search. */
export const GET = routeHandler(async (request) => {
  const parsed = parseDirectoryQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    throw new ValidationError({
      details: parsed.problems.map((p) => ({
        field: p.field,
        code: "INVALID",
        message: p.message,
      })),
    });
  }

  try {
    const result = await searchDirectory({
      actor: await getActor(),
      query: parsed.query,
    });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      throw new ValidationError({ code: "INVALID_CURSOR" });
    }
    throw error;
  }
});
