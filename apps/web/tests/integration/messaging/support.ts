import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import type { TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import type { RateLimiter } from "@/modules/messaging/application/rate-limit";
import { createPrismaMessagingStore } from "@/modules/messaging/infrastructure/prisma-messaging-store";

export const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});

export const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

export const allowAll: RateLimiter = {
  consume: async () => ({ allowed: true, retryAfter: null }),
};

/** Resolves to the AppError code, or "ok". */
export const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

export const cid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const storeFor = (db: TestDatabase) =>
  createPrismaMessagingStore({
    runner: createTransactionRunner(db.prisma),
    outbox: createOutboxWriter(),
    audit: createAuditWriter(),
  });

export async function member(
  db: TestDatabase,
  name: string,
  accountState: "VERIFIED" | "SUSPENDED" = "VERIFIED"
) {
  const user = await db.prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`,
      accountState,
    },
  });
  await db.prisma.profile.create({ data: { userId: user.id, fullName: name } });
  return user.id;
}

/**
 * `blocker` blocked `blocked` (the connection row stores the pair in canonical
 * order).
 */
export async function block(
  db: TestDatabase,
  blocker: string,
  blocked: string
) {
  const [lo, hi] = [blocker, blocked].sort() as [string, string];
  await db.prisma.connection.create({
    data: {
      userAId: lo,
      userBId: hi,
      requestedById: lo,
      state: "BLOCKED",
      blockedById: blocker,
    },
  });
}
