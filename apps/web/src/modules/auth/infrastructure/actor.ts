import { headers } from "next/headers";
import { cache } from "react";

import { prisma } from "@/infrastructure/database/client";
import { apiBudget } from "@/infrastructure/http/api-budget-instance";
import {
  logger,
  REQUEST_ID_HEADER,
  setRequestUser,
} from "@/infrastructure/observability";

import {
  resolveActor,
  type SessionIdentity,
} from "../application/resolve-actor";
import type { Actor } from "../domain/actor";
import { auth } from "./auth";
import { applyEmailVerification, provisionMember } from "./composition";
import { createPrismaGrantSource } from "./prisma-grant-source";

const grantSource = createPrismaGrantSource(prisma);

/** For admin checks on a target user: role-derived ∪ live direct grants, regardless of state. */
export const loadGrants = (userId: string, now: Date) =>
  grantSource.loadGrants(userId, now);

/**
 * The only way server code obtains the current caller (Data Access Layer; replaces getSession()).
 *
 * Reads the session and user rows from the database on every request (Better Auth's cookie cache is
 * disabled), so a revoked session or a changed account state is seen at once. Grants are loaded for
 * VERIFIED accounts only. Memoised per render by React `cache`; Route Handlers and Server Actions
 * call it once at the top and pass the actor down. Returns null when signed out. This proves
 * identity; permissions are checked by `authorize()`.
 *
 * It also repairs the two gaps Better Auth's post-commit hooks can leave: a user with no
 * profile, and a PENDING account whose email was confirmed but whose policy transition did not run.
 * Both use cases are idempotent, and a repair failure never fails the request.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const userId = session.user.id;
  // Inside a Route Handler, the caller's API-wide allowance; refused before any grant load.
  await apiBudget.charge(userId);
  const requestId = requestHeaders.get(REQUEST_ID_HEADER) ?? "unknown";
  const deps = { grantSource, now: () => new Date() };
  const identity: SessionIdentity = {
    userId,
    accountState: session.user.accountState,
  };

  // The profile lookup runs beside the grant load, so VERIFIED users pay no extra latency.
  const [resolved, profile] = await Promise.all([
    resolveActor(deps, identity, requestId),
    prisma.profile.findUnique({ where: { userId }, select: { userId: true } }),
  ]);
  let actor = resolved;

  if (!profile) await repairProvisioning(userId);

  if (actor.accountState === "PENDING") {
    const verified = await repairVerification(userId);
    if (verified) {
      actor = await resolveActor(
        deps,
        { userId, accountState: "VERIFIED" },
        requestId
      );
    }
  }

  setRequestUser(actor.userId);
  return actor;
});

async function repairProvisioning(userId: string): Promise<void> {
  logger.warn("auth.member.unprovisioned", { metadata: { userId } });
  try {
    await provisionMember(userId);
  } catch (error) {
    logger.error("auth.member.repair_failed", {
      error,
      metadata: { userId, step: "provision" },
    });
  }
}

/** True when this call moved the account to VERIFIED. */
async function repairVerification(userId: string): Promise<boolean> {
  try {
    const result = await applyEmailVerification(userId);
    if (result.outcome === "verified") {
      logger.info("auth.member.verified", {
        metadata: { userId, role: result.role, via: "get_actor" },
      });
      return true;
    }
  } catch (error) {
    logger.error("auth.member.repair_failed", {
      error,
      metadata: { userId, step: "verification" },
    });
  }
  return false;
}
