import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createBlockUser } from "@/modules/connections/application/block-user";
import { createGetConnectionStatus } from "@/modules/connections/application/get-connection-status";
import { createListConnections } from "@/modules/connections/application/list-connections";
import { createRemoveConnection } from "@/modules/connections/application/remove-connection";
import { createRequestConnection } from "@/modules/connections/application/request-connection";
import { createRespondToConnection } from "@/modules/connections/application/respond-to-connection";
import { createPrismaConnectionQueries } from "@/modules/connections/infrastructure/prisma-connection-queries";
import { createPrismaConnectionStore } from "@/modules/connections/infrastructure/prisma-connection-store";
import { REREQUEST_COOLDOWN_MS } from "@/modules/connections/domain/connection";

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
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

describe("connections module against real PostgreSQL", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
  });
  afterEach(async () => {
    await db.drop();
  });

  function build() {
    const store = createPrismaConnectionStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
      audit: createAuditWriter(),
    });
    const queries = createPrismaConnectionQueries(db.prisma);
    return {
      request: createRequestConnection({
        store,
        authorize,
        rateLimiter: {
          consume: async () => ({ allowed: true, retryAfter: null }),
        },
      }),
      respond: createRespondToConnection({ store, authorize }),
      remove: createRemoveConnection({ store, authorize }),
      block: createBlockUser({ store, authorize }),
      list: createListConnections({ queries, authorize }),
      status: createGetConnectionStatus({ queries, authorize }),
      queries,
    };
  }

  const member = async (
    name: string,
    accountState: "VERIFIED" | "SUSPENDED" = "VERIFIED"
  ) => {
    const user = await db.prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/\W/g, "")}@example.test`,
        accountState,
      },
    });
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: name },
    });
    return user.id;
  };
  const events = () =>
    db.prisma.outboxEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: { type: true, payload: true, publishedAt: true },
    });

  it("request → accept: one row, both events in the outbox in order, unpublished", async () => {
    const { request, respond } = build();
    const [asha, ravi] = [await member("Asha"), await member("Ravi")];

    const { connectionId } = await request({
      actor: actor(asha),
      recipientId: ravi,
    });
    await respond({ actor: actor(ravi), connectionId, decision: "ACCEPT" });

    expect(await db.prisma.connection.findMany()).toEqual([
      expect.objectContaining({
        id: connectionId,
        state: "ACCEPTED",
        requestedById: asha,
      }),
    ]);
    expect(await events()).toEqual([
      {
        type: "connection.requested",
        payload: { v: 1, connectionId, actorId: asha, recipientId: ravi },
        publishedAt: null,
      },
      {
        type: "connection.accepted",
        payload: { v: 1, connectionId, actorId: ravi, recipientId: asha },
        publishedAt: null,
      },
    ]);
  });

  it("A→B and B→A at the same moment never create two relationships (strategy §12.3)", async () => {
    const { request } = build();
    for (let round = 0; round < 15; round += 1) {
      const [x, y] = [await member(`X${round}`), await member(`Y${round}`)];
      const outcomes = await Promise.all([
        code(request({ actor: actor(x), recipientId: y })),
        code(request({ actor: actor(y), recipientId: x })),
      ]);
      expect(outcomes.sort()).toEqual(["CONNECTION_EXISTS", "ok"]);
      const [a, b] = [x, y].sort();
      expect(
        await db.prisma.connection.count({ where: { userAId: a, userBId: b } })
      ).toBe(1);
    }
    // One event per surviving request, never one per attempt.
    expect(
      (await events()).filter((e) => e.type === "connection.requested")
    ).toHaveLength(15);
  });

  it("many identical concurrent requests still make exactly one row and one event", async () => {
    const { request } = build();
    const [x, y] = [await member("Xena"), await member("Yuri")];
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        code(request({ actor: actor(x), recipientId: y }))
      )
    );
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "CONNECTION_EXISTS")).toHaveLength(7);
    expect(await db.prisma.connection.count()).toBe(1);
    expect(await events()).toHaveLength(1);
  });

  it("accept racing cancel: exactly one wins and the row, the event and the losing error agree", async () => {
    const { request, respond, remove } = build();
    for (let round = 0; round < 10; round += 1) {
      const [x, y] = [await member(`P${round}`), await member(`Q${round}`)];
      const { connectionId } = await request({
        actor: actor(x),
        recipientId: y,
      });
      const before = (await events()).filter(
        (e) => e.type === "connection.accepted"
      ).length;

      const [accepted, cancelled] = await Promise.all([
        code(respond({ actor: actor(y), connectionId, decision: "ACCEPT" })),
        code(remove({ actor: actor(x), connectionId })),
      ]);
      const row = await db.prisma.connection.findUnique({
        where: { id: connectionId },
      });
      const acceptedEvents =
        (await events()).filter((e) => e.type === "connection.accepted")
          .length - before;

      // The transitions are serialised by guarded updates, so one order or the other happened:
      //  - accept first, then the cancel either lost its guard (INVALID_STATE_TRANSITION) or, having read
      //    the accepted row, legitimately removed the accepted connection;
      //  - cancel first, then the accept found nothing.
      // Whatever happened, the row, the event and the outcomes must agree.
      expect(acceptedEvents).toBe(accepted === "ok" ? 1 : 0);
      if (accepted === "ok") {
        expect(["ok", "INVALID_STATE_TRANSITION"]).toContain(cancelled);
        expect(row === null).toBe(cancelled === "ok");
        if (row) expect(row.state).toBe("ACCEPTED");
      } else {
        expect(cancelled).toBe("ok");
        expect(["NOT_FOUND", "INVALID_STATE_TRANSITION"]).toContain(accepted);
        expect(row).toBeNull();
      }
    }
  });

  it("re-request cooldown: blocked for 30 days for the rejected side, then the SAME row is reused", async () => {
    const { request, respond } = build();
    const [x, y] = [await member("Xavi"), await member("Yara")];
    const { connectionId } = await request({ actor: actor(x), recipientId: y });
    await respond({ actor: actor(y), connectionId, decision: "REJECT" });

    expect(await code(request({ actor: actor(x), recipientId: y }))).toBe(
      "CONNECTION_COOLDOWN"
    );

    await db.prisma.connection.update({
      where: { id: connectionId },
      data: {
        respondedAt: new Date(Date.now() - REREQUEST_COOLDOWN_MS - 60_000),
      },
    });
    const again = await request({ actor: actor(x), recipientId: y });
    expect(again.connectionId).toBe(connectionId);
    expect(await db.prisma.connection.count()).toBe(1);
    expect(
      await db.prisma.connection.findUnique({ where: { id: connectionId } })
    ).toMatchObject({
      state: "PENDING",
      respondedAt: null,
    });
  });

  it("blocking: no requests either way, statuses are one-sided, and only the blocker can unblock", async () => {
    const { request, block, status, remove, queries } = build();
    const [x, y] = [await member("Xiao"), await member("Yoko")];
    await block({ actor: actor(x), targetUserId: y });

    expect(await code(request({ actor: actor(x), recipientId: y }))).toBe(
      "USER_BLOCKED"
    );
    expect(await code(request({ actor: actor(y), recipientId: x }))).toBe(
      "NOT_FOUND"
    );
    expect((await status({ actor: actor(x), otherUserId: y })).state).toBe(
      "BLOCKED_BY_ME"
    );
    expect(await status({ actor: actor(y), otherUserId: x })).toEqual({
      state: "NONE",
    });
    // The users module's lookup treats the block as symmetric, hiding both profiles.
    expect(await queries.relation(x, y)).toBe("blocked");
    expect(await queries.relation(y, x)).toBe("blocked");

    const { connectionId } = await block({ actor: actor(x), targetUserId: y });
    expect(await code(remove({ actor: actor(y), connectionId }))).toBe(
      "NOT_FOUND"
    );
    await remove({ actor: actor(x), connectionId });
    // Block and unblock leave append-only audit rows: ids only, target is the other member.
    expect(
      await db.prisma.auditLog.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          action: true,
          actorId: true,
          targetType: true,
          targetId: true,
          metadata: true,
        },
      })
    ).toEqual([
      {
        action: "connection.blocked",
        actorId: x,
        targetType: "user",
        targetId: y,
        metadata: { connectionId },
      },
      {
        action: "connection.unblocked",
        actorId: x,
        targetType: "user",
        targetId: y,
        metadata: { connectionId },
      },
    ]);
    expect(await queries.relation(x, y)).toBe("none");
    expect(await code(request({ actor: actor(y), recipientId: x }))).toBe("ok");
  });

  it("blocking ends an accepted connection", async () => {
    const { request, respond, block, queries } = build();
    const [x, y] = [await member("Xan"), await member("Yin")];
    const { connectionId } = await request({ actor: actor(x), recipientId: y });
    await respond({ actor: actor(y), connectionId, decision: "ACCEPT" });
    expect(await queries.relation(x, y)).toBe("connected");
    await block({ actor: actor(y), targetUserId: x });
    expect(await queries.relation(x, y)).toBe("blocked");
    expect(await db.prisma.connection.count()).toBe(1);
  });

  it("refuses a request to an unverified member as NOT_FOUND and writes nothing", async () => {
    const { request } = build();
    const [x, y] = [await member("Xeno"), await member("Yves", "SUSPENDED")];
    expect(await code(request({ actor: actor(x), recipientId: y }))).toBe(
      "NOT_FOUND"
    );
    expect(await db.prisma.connection.count()).toBe(0);
    expect(await events()).toEqual([]);
  });

  it("lists the caller's own connections with names, pages by cursor, and hides suspended members", async () => {
    const { request, respond, block, list } = build();
    const me = await member("Me Myself");
    const names = ["Ann", "Bea", "Cal"];
    for (const name of names) {
      const other = await member(name);
      const { connectionId } = await request({
        actor: actor(other),
        recipientId: me,
      });
      await respond({ actor: actor(me), connectionId, decision: "ACCEPT" });
      await new Promise((r) => setTimeout(r, 5)); // distinct requested_at
    }
    const gone = await member("Dan Gone");
    const { connectionId: goneId } = await request({
      actor: actor(gone),
      recipientId: me,
    });
    await respond({
      actor: actor(me),
      connectionId: goneId,
      decision: "ACCEPT",
    });
    await db.prisma.user.update({
      where: { id: gone },
      data: { accountState: "SUSPENDED" },
    });
    await block({
      actor: actor(me),
      targetUserId: await member("Eve Blocked"),
    });

    const first = await list({ actor: actor(me), limit: 2 });
    const second = await list({
      actor: actor(me),
      limit: 2,
      cursor: first.page.nextCursor!,
    });
    const all = [...first.data, ...second.data].map((d) => d.user.fullName);
    expect(all.sort()).toEqual(["Ann", "Bea", "Cal"]);
    expect(second.page.hasMore).toBe(false);
    expect(first.data[0]).toMatchObject({
      state: "ACCEPTED",
      direction: "INCOMING",
    });

    const blockedList = await list({ actor: actor(me), state: "BLOCKED" });
    expect(blockedList.data.map((d) => d.user.fullName)).toEqual([
      "Eve Blocked",
    ]);
  });

  it("incoming and outgoing lists split by who asked; a rejected request is listed for nobody", async () => {
    const { request, respond, list } = build();
    const [me, ann, bea] = [
      await member("Mia"),
      await member("Ann2"),
      await member("Bea2"),
    ];
    await request({ actor: actor(ann), recipientId: me });
    await request({ actor: actor(me), recipientId: bea });
    const rejected = await member("Cat2");
    const { connectionId } = await request({
      actor: actor(rejected),
      recipientId: me,
    });
    await respond({ actor: actor(me), connectionId, decision: "REJECT" });

    const incoming = await list({
      actor: actor(me),
      state: "PENDING",
      direction: "INCOMING",
    });
    const outgoing = await list({
      actor: actor(me),
      state: "PENDING",
      direction: "OUTGOING",
    });
    expect(incoming.data.map((d) => d.user.fullName)).toEqual(["Ann2"]);
    expect(outgoing.data.map((d) => d.user.fullName)).toEqual(["Bea2"]);
    expect(
      (await list({ actor: actor(rejected), state: "PENDING" })).data
    ).toEqual([]);
  });
});
