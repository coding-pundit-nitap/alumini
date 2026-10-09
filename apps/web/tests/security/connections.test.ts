import { describe, expect, it, vi } from "vitest";

/**
 * Every connection use case against the real authorizer: 401, 403, account
 * states and IDOR.
 */
import { AuthorizationError } from "@/lib/errors";
import { createAuthorization } from "@/modules/auth/application/authorize";
import type { Actor } from "@/modules/auth";

import { createFakeConnectionStore } from "../support/fake-connection-store";
import type { ConnectionRow } from "@/modules/connections/domain/connection";
import { createBlockUser } from "@/modules/connections/application/block-user";
import { createGetConnectionStatus } from "@/modules/connections/application/get-connection-status";
import { createListConnections } from "@/modules/connections/application/list-connections";
import { createRemoveConnection } from "@/modules/connections/application/remove-connection";
import { createRequestConnection } from "@/modules/connections/application/request-connection";
import { createRespondToConnection } from "@/modules/connections/application/respond-to-connection";

// The REAL authorizer (not a stub): what the RBAC matrix grants is what these tests exercise.
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => new Date("2026-09-21T10:00:00Z"),
});

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

const grant = {
  permission: "connection.manage" as const,
  scope: "GLOBAL" as const,
  expiresAt: null,
};
const actor = (userId: string, over: Partial<Actor> = {}): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [grant],
  ...over,
});

const pending: ConnectionRow = {
  id: "c1",
  userAId: A,
  userBId: B,
  requestedById: A,
  blockedById: null,
  state: "PENDING",
  requestedAt: new Date("2026-09-01T00:00:00Z"),
  respondedAt: null,
};

function build() {
  const fake = createFakeConnectionStore([pending]);
  const observe = vi.fn();
  const rateLimiter = {
    consume: async () => ({ allowed: true, retryAfter: null }),
  };
  const deps = { store: fake.store, authorize, observe };
  return {
    fake,
    observe,
    // Every use case, called as `who` against the pair A–B (row c1, A asked B).
    calls: {
      request: (who: Actor | null) =>
        createRequestConnection({ ...deps, rateLimiter })({
          actor: who,
          recipientId: C,
        }),
      respond: (who: Actor | null) =>
        createRespondToConnection(deps)({
          actor: who,
          connectionId: "c1",
          decision: "ACCEPT",
        }),
      remove: (who: Actor | null) =>
        createRemoveConnection(deps)({ actor: who, connectionId: "c1" }),
      block: (who: Actor | null) =>
        createBlockUser(deps)({ actor: who, targetUserId: C }),
      list: (who: Actor | null) =>
        createListConnections({ queries: fake.queries, authorize })({
          actor: who,
        }),
      status: (who: Actor | null) =>
        createGetConnectionStatus({ queries: fake.queries, authorize })({
          actor: who,
          otherUserId: A,
        }),
    },
  };
}

const names = [
  "request",
  "respond",
  "remove",
  "block",
  "list",
  "status",
] as const;

const untouched = (fake: ReturnType<typeof build>["fake"]) => ({
  rows: fake.rows(),
  events: fake.events(),
  audits: fake.audits(),
});

describe("connection use cases: unauthenticated, denied, and non-party callers", () => {
  it.each(names)("%s: no session is a 401 and writes nothing", async (name) => {
    const { calls, fake, observe } = build();
    const before = untouched(fake);
    await expect(calls[name](null)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(untouched(fake)).toEqual(before);
    expect(observe).not.toHaveBeenCalled();
  });

  it.each(names)(
    "%s: a verified member without connection.manage is a 403 and writes nothing",
    async (name) => {
      const { calls, fake, observe } = build();
      const before = untouched(fake);
      await expect(
        calls[name](actor(B, { grants: [] }))
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(untouched(fake)).toEqual(before);
      expect(observe).not.toHaveBeenCalled();
    }
  );

  it.each(["PENDING", "REJECTED", "SUSPENDED", "DEACTIVATED"] as const)(
    "every use case refuses a %s account, even if grants were left on the actor",
    async (accountState) => {
      const { calls, fake, observe } = build();
      const before = untouched(fake);
      for (const name of names) {
        await expect(
          calls[name](actor(B, { accountState }))
        ).rejects.toBeInstanceOf(AuthorizationError);
      }
      expect(untouched(fake)).toEqual(before);
      expect(observe).not.toHaveBeenCalled();
    }
  );

  it("a member holding the permission is allowed (guards against an always-deny bug)", async () => {
    const { calls } = build();
    await expect(calls.respond(actor(B))).resolves.toEqual({
      state: "ACCEPTED",
    });
  });

  describe("IDOR: a verified stranger holding the permission", () => {
    it.each(["respond", "remove"] as const)(
      "%s on someone else's connection id is NOT_FOUND and changes nothing",
      async (name) => {
        const { calls, fake, observe } = build();
        const before = untouched(fake);
        await expect(calls[name](actor(C))).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
        expect(untouched(fake)).toEqual(before);
        expect(observe).not.toHaveBeenCalled();
      }
    );

    it("status and list reveal nothing about a pair the caller is not in", async () => {
      const { calls } = build();
      expect(await calls.status(actor(C))).toEqual({ state: "NONE" });
      expect((await calls.list(actor(C))).data).toEqual([]);
    });
  });
});
