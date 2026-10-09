import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationError,
  ConflictError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeConnectionStore } from "../../../../tests/support/fake-connection-store";
import {
  REREQUEST_COOLDOWN_MS,
  type ConnectionRow,
} from "../domain/connection";
import type { ConnectionStore } from "./connection-store";
import { createBlockUser } from "./block-user";
import { createGetConnectionStatus } from "./get-connection-status";
import { createListConnections } from "./list-connections";
import { createRemoveConnection } from "./remove-connection";
import { createRequestConnection, REQUEST_RATE } from "./request-connection";
import { createRespondToConnection } from "./respond-to-connection";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const now = new Date("2026-09-21T10:00:00Z");
const clock = () => now;

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const allowAll = { consume: async () => ({ allowed: true, retryAfter: null }) };

const row = (over: Partial<ConnectionRow> = {}): ConnectionRow => ({
  id: "c1",
  userAId: A,
  userBId: B,
  requestedById: A,
  blockedById: null,
  state: "PENDING",
  requestedAt: new Date("2026-09-01T00:00:00Z"),
  respondedAt: null,
  ...over,
});

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (e: { code?: string }) => e.code ?? e.constructor.name
  );

function setup(
  seed: ConnectionRow[] = [],
  opts: Parameters<typeof createFakeConnectionStore>[1] = {}
) {
  const fake = createFakeConnectionStore(seed, opts);
  return {
    ...fake,
    request: createRequestConnection({
      store: fake.store,
      authorize,
      rateLimiter: allowAll,
      now: clock,
    }),
    respond: createRespondToConnection({
      store: fake.store,
      authorize,
      now: clock,
    }),
    remove: createRemoveConnection({ store: fake.store, authorize }),
    block: createBlockUser({ store: fake.store, authorize, now: clock }),
  };
}

describe("requestConnection", () => {
  it("creates one PENDING row in canonical order and writes connection.requested with ids only", async () => {
    const { request, rows, events } = setup();
    const result = await request({ actor: actor(B), recipientId: A });
    expect(rows()).toEqual([
      expect.objectContaining({
        id: result.connectionId,
        userAId: A,
        userBId: B,
        requestedById: B,
        state: "PENDING",
      }),
    ]);
    expect(events()).toEqual([
      {
        type: "connection.requested",
        payload: {
          v: 1,
          connectionId: result.connectionId,
          actorId: B,
          recipientId: A,
        },
      },
    ]);
  });

  it("rejects a guest (401) and a self-request (CANNOT_CONNECT_SELF)", async () => {
    const { request, rows } = setup();
    expect(await code(request({ actor: null, recipientId: B }))).toBe(
      "UNAUTHENTICATED"
    );
    const error = await request({
      actor: actor(A),
      recipientId: A.toUpperCase(),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe("CANNOT_CONNECT_SELF");
    expect(rows()).toEqual([]);
  });

  it("treats a recipient who is unknown or not verified as NOT_FOUND", async () => {
    const { request } = setup([], { accountStates: { [B]: "PENDING" } });
    expect(await code(request({ actor: actor(A), recipientId: B }))).toBe(
      "NOT_FOUND"
    );
    expect(await code(request({ actor: actor(A), recipientId: C }))).toBe(
      "resolved"
    );
  });

  it("refuses to spend the rate limit's budget twice: 429 writes nothing", async () => {
    const consume = vi.fn(async () => ({ allowed: false, retryAfter: 42 }));
    const fake = createFakeConnectionStore();
    const request = createRequestConnection({
      store: fake.store,
      authorize,
      rateLimiter: { consume },
      now: clock,
    });
    await expect(
      request({ actor: actor(A), recipientId: B })
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(consume).toHaveBeenCalledWith(
      `connections.create:${A}`,
      REQUEST_RATE
    );
    expect(fake.rows()).toEqual([]);
  });

  it.each([
    ["from the same side", A],
    ["from the other side (accept instead)", B],
  ])("refuses a second request %s as CONNECTION_EXISTS", async (_l, who) => {
    const { request, rows, events } = setup([row()]);
    expect(
      await code(request({ actor: actor(who), recipientId: who === A ? B : A }))
    ).toBe("CONNECTION_EXISTS");
    expect(rows()).toHaveLength(1);
    expect(events()).toEqual([]);
  });

  it("A→B and B→A racing: the loser's insert is a no-op, the pair ends with ONE row and ONE event", async () => {
    // B's request wins the unique pair after A has read "no row" but before A inserts.
    let played = false;
    const { request, rows, events } = setup([], {
      beforeInsert(map) {
        if (played) return;
        played = true;
        map.set("winner", row({ id: "winner", requestedById: B }));
      },
    });
    const outcome = await code(request({ actor: actor(A), recipientId: B }));
    expect(outcome).toBe("CONNECTION_EXISTS");
    expect(rows().map((r) => r.id)).toEqual(["winner"]);
    expect(events()).toEqual([]);
  });

  it("makes the rejected requester wait out the cooldown, with the eligibility date in details", async () => {
    const respondedAt = new Date(now.getTime() - 1000);
    const { request } = setup([row({ state: "REJECTED", respondedAt })]);
    const error = await request({ actor: actor(A), recipientId: B }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("CONNECTION_COOLDOWN");
    expect(error.details).toEqual([
      {
        eligibleAt: new Date(
          respondedAt.getTime() + REREQUEST_COOLDOWN_MS
        ).toISOString(),
      },
    ]);
  });

  it("reuses the rejected row after the cooldown (no second row) and emits the event", async () => {
    const respondedAt = new Date(now.getTime() - REREQUEST_COOLDOWN_MS - 1);
    const { request, rows, events } = setup([
      row({ state: "REJECTED", respondedAt }),
    ]);
    const { connectionId } = await request({ actor: actor(A), recipientId: B });
    expect(connectionId).toBe("c1");
    expect(rows()).toEqual([
      expect.objectContaining({
        state: "PENDING",
        requestedAt: now,
        respondedAt: null,
      }),
    ]);
    expect(events()).toHaveLength(1);
  });

  it("tells the blocker USER_BLOCKED and the blocked member NOT_FOUND", async () => {
    const blocked = row({ state: "BLOCKED", blockedById: A, respondedAt: now });
    const { request } = setup([blocked]);
    expect(await code(request({ actor: actor(A), recipientId: B }))).toBe(
      "USER_BLOCKED"
    );
    expect(await code(request({ actor: actor(B), recipientId: A }))).toBe(
      "NOT_FOUND"
    );
  });

  it("rolls the row back when the outbox write fails", async () => {
    const { request, rows, events } = setup([], { failEnqueue: true });
    await expect(request({ actor: actor(A), recipientId: B })).rejects.toThrow(
      "outbox down"
    );
    expect(rows()).toEqual([]);
    expect(events()).toEqual([]);
  });
});

describe("respondToConnection", () => {
  it("accept: the recipient moves it to ACCEPTED and connection.accepted names the requester", async () => {
    const { respond, rows, events } = setup([row()]);
    expect(
      await respond({ actor: actor(B), connectionId: "c1", decision: "ACCEPT" })
    ).toEqual({ state: "ACCEPTED" });
    expect(rows()[0]).toMatchObject({ state: "ACCEPTED", respondedAt: now });
    expect(events()).toEqual([
      {
        type: "connection.accepted",
        payload: { v: 1, connectionId: "c1", actorId: B, recipientId: A },
      },
    ]);
  });

  it("reject: silent (no event), and records when, for the cooldown", async () => {
    const { respond, rows, events } = setup([row()]);
    await respond({ actor: actor(B), connectionId: "c1", decision: "REJECT" });
    expect(rows()[0]).toMatchObject({ state: "REJECTED", respondedAt: now });
    expect(events()).toEqual([]);
  });

  it("refuses the requester (NOT_CONNECTION_RECIPIENT), a stranger and a missing id (NOT_FOUND)", async () => {
    const { respond, rows } = setup([row()]);
    expect(
      await code(
        respond({ actor: actor(A), connectionId: "c1", decision: "ACCEPT" })
      )
    ).toBe("NOT_CONNECTION_RECIPIENT");
    expect(
      await code(
        respond({ actor: actor(C), connectionId: "c1", decision: "ACCEPT" })
      )
    ).toBe("NOT_FOUND");
    expect(
      await code(
        respond({ actor: actor(B), connectionId: "nope", decision: "ACCEPT" })
      )
    ).toBe("NOT_FOUND");
    expect(rows()[0]?.state).toBe("PENDING");
  });

  it("cannot answer twice: INVALID_STATE_TRANSITION", async () => {
    const { respond } = setup([row({ state: "ACCEPTED", respondedAt: now })]);
    expect(
      await code(
        respond({ actor: actor(B), connectionId: "c1", decision: "REJECT" })
      )
    ).toBe("INVALID_STATE_TRANSITION");
  });

  it("accept racing a cancel has one winner: the guarded update fails the loser, no event", async () => {
    // Between the accepter's read and its update, another transaction moves the row (here: a block).
    const fake = createFakeConnectionStore([row()]);
    const store: ConnectionStore = {
      transaction: (work) =>
        fake.store.transaction((tx) =>
          work({
            ...tx,
            update: async (id, from, patch) => {
              fake.rows()[0]!.state = "BLOCKED";
              return tx.update(id, from, patch);
            },
          })
        ),
    };
    const respond = createRespondToConnection({ store, authorize, now: clock });
    expect(
      await code(
        respond({ actor: actor(B), connectionId: "c1", decision: "ACCEPT" })
      )
    ).toBe("INVALID_STATE_TRANSITION");
    expect(fake.events()).toEqual([]);
  });
});

describe("removeConnection", () => {
  it.each([
    ["cancels your own pending request", row(), A, "cancelled"],
    [
      "removes an accepted connection (either side)",
      row({ state: "ACCEPTED", respondedAt: now }),
      B,
      "removed",
    ],
    [
      "lifts your own block",
      row({ state: "BLOCKED", blockedById: A, respondedAt: now }),
      A,
      "unblocked",
    ],
  ])("%s", async (_l, seed, who, outcome) => {
    const { remove, rows } = setup([seed]);
    expect(await remove({ actor: actor(who), connectionId: "c1" })).toEqual({
      outcome,
    });
    expect(rows()).toEqual([]);
  });

  it.each([
    [
      "the recipient deleting an incoming request",
      row(),
      B,
      "INVALID_STATE_TRANSITION",
    ],
    [
      "anyone deleting a rejected row (would erase the cooldown)",
      row({ state: "REJECTED", respondedAt: now }),
      A,
      "INVALID_STATE_TRANSITION",
    ],
    [
      "the blocked member deleting the block",
      row({ state: "BLOCKED", blockedById: A, respondedAt: now }),
      B,
      "NOT_FOUND",
    ],
    ["a stranger", row(), C, "NOT_FOUND"],
  ])("refuses %s", async (_l, seed, who, expected) => {
    const { remove, rows } = setup([seed]);
    expect(await code(remove({ actor: actor(who), connectionId: "c1" }))).toBe(
      expected
    );
    expect(rows()).toHaveLength(1);
  });
});

describe("blockUser", () => {
  it("blocks a member with no prior request: a BLOCKED row with the blocker recorded", async () => {
    const { block, rows } = setup();
    await block({ actor: actor(B), targetUserId: A });
    expect(rows()).toEqual([
      expect.objectContaining({
        userAId: A,
        userBId: B,
        state: "BLOCKED",
        blockedById: B,
        requestedById: B,
      }),
    ]);
  });

  it.each(["PENDING", "ACCEPTED", "REJECTED"] as const)(
    "replaces a %s row",
    async (state) => {
      const { block, rows, events } = setup([
        row({ state, respondedAt: state === "PENDING" ? null : now }),
      ]);
      expect(await block({ actor: actor(B), targetUserId: A })).toEqual({
        connectionId: "c1",
      });
      expect(rows()).toEqual([
        expect.objectContaining({
          state: "BLOCKED",
          blockedById: B,
          requestedById: A,
        }),
      ]);
      expect(events()).toEqual([]);
    }
  );

  it("is idempotent for the blocker, invisible to the blocked, and refuses self and unknown members", async () => {
    const { block, rows } = setup(
      [row({ state: "BLOCKED", blockedById: A, respondedAt: now })],
      {
        accountStates: { [C]: "" },
      }
    );
    expect(await block({ actor: actor(A), targetUserId: B })).toEqual({
      connectionId: "c1",
    });
    expect(await code(block({ actor: actor(B), targetUserId: A }))).toBe(
      "NOT_FOUND"
    );
    expect(await code(block({ actor: actor(A), targetUserId: A }))).toBe(
      "CANNOT_CONNECT_SELF"
    );
    expect(rows()).toHaveLength(1);
  });

  it("a lost insert race ends in a block on the winner's row, never a second row", async () => {
    let played = false;
    const { block, rows } = setup([], {
      beforeInsert(map) {
        if (played) return;
        played = true;
        map.set("winner", row({ id: "winner", requestedById: A }));
      },
    });
    await block({ actor: actor(B), targetUserId: A });
    expect(rows()).toEqual([
      expect.objectContaining({
        id: "winner",
        state: "BLOCKED",
        blockedById: B,
      }),
    ]);
  });
});

describe("listConnections and getConnectionStatus", () => {
  it("pages newest first with an opaque cursor, and never lists a REJECTED row", async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      row({
        id: `c${i}`,
        userAId: A,
        userBId: `00000000-0000-4000-8000-0000000001${i}0`,
        state: "ACCEPTED",
        respondedAt: now,
        requestedAt: new Date(2026, 8, 1 + i),
      })
    );
    const { queries } = setup(many);
    const list = createListConnections({ queries, authorize });

    const first = await list({ actor: actor(A), limit: 2 });
    expect(first.data.map((d) => d.id)).toEqual(["c4", "c3"]);
    expect(first.page.hasMore).toBe(true);

    const second = await list({
      actor: actor(A),
      limit: 2,
      cursor: first.page.nextCursor!,
    });
    expect(second.data.map((d) => d.id)).toEqual(["c2", "c1"]);
    const third = await list({
      actor: actor(A),
      limit: 2,
      cursor: second.page.nextCursor!,
    });
    expect(third.data.map((d) => d.id)).toEqual(["c0"]);
    expect(third.page).toEqual({ limit: 2, nextCursor: null, hasMore: false });

    await expect(
      list({ actor: actor(A), cursor: "garbage" })
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("shows each member their own side of the pair", async () => {
    const { queries } = setup([row()]);
    const status = createGetConnectionStatus({ queries, authorize });
    expect(await status({ actor: actor(A), otherUserId: B })).toEqual({
      state: "OUTGOING",
      connectionId: "c1",
    });
    expect(await status({ actor: actor(B), otherUserId: A })).toEqual({
      state: "INCOMING",
      connectionId: "c1",
    });
    expect(await status({ actor: actor(C), otherUserId: A })).toEqual({
      state: "NONE",
    });
  });
});

describe("audit and observation", () => {
  it("block records connection.blocked in the same transaction, once, naming the target", async () => {
    const { block, audits } = setup();
    const { connectionId } = await block({ actor: actor(B), targetUserId: A });
    expect(audits()).toEqual([
      {
        action: "connection.blocked",
        actorId: B,
        targetUserId: A,
        connectionId,
      },
    ]);
  });

  it("blocking twice records nothing the second time", async () => {
    const { block, audits } = setup();
    await block({ actor: actor(B), targetUserId: A });
    await block({ actor: actor(B), targetUserId: A });
    expect(audits()).toHaveLength(1);
  });

  it("unblocking records connection.unblocked; cancelling or removing records no audit", async () => {
    const blocked = setup([
      row({ state: "BLOCKED", blockedById: A, respondedAt: now }),
    ]);
    await blocked.remove({ actor: actor(A), connectionId: "c1" });
    expect(blocked.audits()).toEqual([
      {
        action: "connection.unblocked",
        actorId: A,
        targetUserId: B,
        connectionId: "c1",
      },
    ]);
    const cancelled = setup([row()]);
    await cancelled.remove({ actor: actor(A), connectionId: "c1" });
    expect(cancelled.audits()).toEqual([]);
  });

  it("a failing audit write rolls the block back", async () => {
    const { block, rows, audits } = setup([row()], { failAudit: true });
    await expect(block({ actor: actor(B), targetUserId: A })).rejects.toThrow(
      "audit down"
    );
    expect(rows()[0]?.state).toBe("PENDING");
    expect(audits()).toEqual([]);
  });

  it("reports each committed outcome once, after the commit, and nothing on a refusal", async () => {
    const observe = vi.fn();
    const fake = createFakeConnectionStore();
    const deps = { store: fake.store, authorize, observe };
    const request = createRequestConnection({
      ...deps,
      rateLimiter: allowAll,
      now: clock,
    });
    const respond = createRespondToConnection({ ...deps, now: clock });
    const remove = createRemoveConnection(deps);
    const block = createBlockUser({ ...deps, now: clock });

    const { connectionId } = await request({ actor: actor(A), recipientId: B });
    await respond({ actor: actor(B), connectionId, decision: "ACCEPT" });
    await remove({ actor: actor(A), connectionId });
    await block({ actor: actor(A), targetUserId: B });
    await block({ actor: actor(A), targetUserId: B }); // idempotent: not reported again
    await request({ actor: actor(A), recipientId: B }).catch(() => {}); // refused: not reported

    expect(observe.mock.calls.map((c) => c[0])).toEqual([
      "requested",
      "accepted",
      "removed",
      "blocked",
    ]);
    expect(observe).toHaveBeenCalledWith("requested", connectionId);
  });

  it("does not report an outcome whose transaction rolled back", async () => {
    const observe = vi.fn();
    const fake = createFakeConnectionStore([], { failEnqueue: true });
    const request = createRequestConnection({
      store: fake.store,
      authorize,
      rateLimiter: allowAll,
      observe,
    });
    await expect(
      request({ actor: actor(A), recipientId: B })
    ).rejects.toThrow();
    expect(observe).not.toHaveBeenCalled();
  });
});
