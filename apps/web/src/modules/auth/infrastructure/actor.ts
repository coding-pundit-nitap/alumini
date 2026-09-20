import { headers } from "next/headers";
import { cache } from "react";

import { prisma } from "@/infrastructure/database/client";
import {
  REQUEST_ID_HEADER,
  setRequestUser,
} from "@/infrastructure/observability";

import { resolveActor } from "../application/resolve-actor";
import type { Actor } from "../domain/actor";
import { auth } from "./auth";
import { createPrismaGrantSource } from "./prisma-grant-source";

const grantSource = createPrismaGrantSource(prisma);

/**
 * The only way server code obtains the current caller (Data Access Layer; replaces getSession()).
 *
 * Reads the session and user rows from the database on every request (Better Auth's cookie cache is
 * disabled), so a revoked session or a changed account state is seen at once. Grants are loaded for
 * VERIFIED accounts only. Memoised per render by React `cache`; Route Handlers and Server Actions
 * call it once at the top and pass the actor down. Returns null when signed out. This proves
 * identity; permissions are checked by `authorize()` (TDS §7.3-7.4).
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const actor = await resolveActor(
    { grantSource, now: () => new Date() },
    { userId: session.user.id, accountState: session.user.accountState },
    requestHeaders.get(REQUEST_ID_HEADER) ?? "unknown"
  );
  setRequestUser(actor.userId);
  return actor;
});
