import { z } from "zod";

import {
  removeConnection,
  respondToConnection,
} from "@/composition/connections";
import { assertSameOrigin } from "@/infrastructure/http/assert-same-origin";
import { routeHandler } from "@/infrastructure/http/route-handler";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { readJson } from "../../_lib/request";

const patchBody = z
  .object({ state: z.enum(["ACCEPTED", "REJECTED"]) })
  .strict();
const id = z.uuid();

type Params = { params: Promise<{ id: string }> };

async function connectionId({ params }: Params): Promise<string> {
  const parsed = id.safeParse((await params).id);
  // A malformed id and an unknown one are the same answer.
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

/** PATCH /api/v1/connections/:id — accept or reject a request. */
export const PATCH = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError({
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(body)",
        code: "INVALID",
        message: issue.message,
      })),
    });
  }

  const connection = await connectionId(ctx);
  const { state } = await respondToConnection({
    actor: await getActor(),
    connectionId: connection,
    decision: parsed.data.state === "ACCEPTED" ? "ACCEPT" : "REJECT",
  });
  return Response.json({ data: { id: connection, state } });
});

/** DELETE /api/v1/connections/:id — cancel, remove or unblock. */
export const DELETE = routeHandler(async (request, ctx: Params) => {
  assertSameOrigin(request);
  await removeConnection({
    actor: await getActor(),
    connectionId: await connectionId(ctx),
  });
  return new Response(null, { status: 204 });
});
