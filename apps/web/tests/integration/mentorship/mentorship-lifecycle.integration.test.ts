import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { AuthenticationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";
import { createRequestMentorship } from "@/modules/mentorship/application/request-mentorship";
import { createTransitionMentorship } from "@/modules/mentorship/application/transition-mentorship";
import { createPrismaMentorshipStore } from "@/modules/mentorship/infrastructure/prisma-mentorship-store";

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
// The store and its SQL (activeMentorSql, profileVisibilitySql) is what this file exercises; the
// use cases' own permission gate is unit-tested against the fake store (mentorship-use-cases.test.ts).
const authorize = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};
const allowAll = { consume: async () => ({ allowed: true, retryAfter: null }) };
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

describe("mentorship lifecycle against real PostgreSQL", () => {
  let db: TestDatabase;
  let grantor: string;
  let n = 0;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    n = 0;
    grantor = (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: "grantor@example.test",
          accountState: "VERIFIED",
        },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  function build(outbox = createOutboxWriter()) {
    const store = createPrismaMentorshipStore({
      runner: createTransactionRunner(db.prisma),
      outbox,
    });
    return {
      store,
      request: createRequestMentorship({
        store,
        authorize,
        rateLimiter: allowAll,
      }),
      transition: createTransitionMentorship({ store, authorize }),
    };
  }

  async function grantRole(userId: string, roleName: "ALUMNI" | "STUDENT") {
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await db.prisma.userRole.create({
      data: { userId, roleId: role.id, grantedBy: grantor },
    });
  }

  async function member(
    name: string,
    opts: {
      visibility?: "PUBLIC" | "MEMBERS_ONLY" | "CONNECTIONS_ONLY" | "PRIVATE";
    } = {}
  ) {
    n += 1;
    const user = await db.prisma.user.create({
      data: { name, email: `u${n}@example.test`, accountState: "VERIFIED" },
    });
    await db.prisma.profile.create({
      data: {
        userId: user.id,
        fullName: name,
        visibility: opts.visibility ?? "MEMBERS_ONLY",
      },
    });
    return user.id;
  }

  /** A member who is also an active mentor, opted in with `maxMentees` slots. */
  async function mentor(
    name: string,
    opts: {
      maxMentees?: number;
      accepting?: boolean;
      visibility?: "PUBLIC" | "MEMBERS_ONLY" | "CONNECTIONS_ONLY" | "PRIVATE";
    } = {}
  ) {
    const userId = await member(name, { visibility: opts.visibility });
    await grantRole(userId, "ALUMNI");
    await db.prisma.mentorProfile.create({
      data: {
        userId,
        expertise: "Databases",
        maxMentees: opts.maxMentees ?? 3,
        accepting: opts.accepting ?? true,
      },
    });
    return userId;
  }

  /**
   * A member who may request a mentorship (holds `mentorship.request` via
   * STUDENT).
   */
  async function student(name: string) {
    const userId = await member(name);
    await grantRole(userId, "STUDENT");
    return userId;
  }

  async function link(
    x: string,
    y: string,
    state: "ACCEPTED" | "BLOCKED",
    by = x
  ) {
    const [userAId, userBId] = [x, y].sort() as [string, string];
    await db.prisma.connection.create({
      data: {
        userAId,
        userBId,
        requestedById: by,
        state,
        blockedById: state === "BLOCKED" ? by : null,
        respondedAt: new Date(),
      },
    });
  }

  const events = (type?: string) =>
    db.prisma.outboxEvent.findMany({
      where: type ? { type } : { type: { startsWith: "mentorship." } },
      orderBy: { createdAt: "asc" },
      select: { type: true, payload: true },
    });

  it("8 parallel identical requests: exactly one ok, one row, one outbox event", async () => {
    const { request } = build();
    const m = await mentor("Mentor Dup");
    const s = await student("Student Dup");

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        code(
          request({ actor: actor(s), mentorId: m, input: { message: "hi" } })
        )
      )
    );
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(
      outcomes.filter((o) => o === "MENTORSHIP_REQUEST_EXISTS")
    ).toHaveLength(7);
    expect(await db.prisma.mentorship.count()).toBe(1);
    expect(await events("mentorship.requested")).toHaveLength(1);
  });

  it("capacity under concurrency: 6 parallel accepts against 2 slots never exceed maxMentees, 5 rounds", async () => {
    const { transition } = build();
    for (let round = 0; round < 5; round += 1) {
      const m = await mentor(`Mentor Cap ${round}`, { maxMentees: 2 });
      const students = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          student(`Student Cap ${round}-${i}`)
        )
      );
      const rows = await Promise.all(
        students.map((s) =>
          db.prisma.mentorship.create({
            data: { mentorId: m, menteeId: s, message: "please mentor me" },
          })
        )
      );

      const outcomes = await Promise.all(
        rows.map((row) =>
          code(
            transition({
              actor: actor(m),
              mentorshipId: row.id,
              action: "accept",
            })
          )
        )
      );
      expect(outcomes.filter((o) => o === "ok")).toHaveLength(2);
      expect(outcomes.filter((o) => o === "MENTOR_AT_CAPACITY")).toHaveLength(
        4
      );
      expect(
        await db.prisma.mentorship.count({
          where: { mentorId: m, state: "ACCEPTED" },
        })
      ).toBe(2);
    }
  });

  it("accept racing cancel: the guarded update serialises them, the row and its events always agree", async () => {
    // If the transactions run sequentially, accept can win and cancel then cancels the ACCEPTED row.
    // Neither may both refuse, and event counts must match the row.
    const { request, transition } = build();
    for (let round = 0; round < 10; round += 1) {
      const m = await mentor(`Mentor Race ${round}`);
      const s = await student(`Student Race ${round}`);
      const { mentorshipId } = await request({
        actor: actor(s),
        mentorId: m,
        input: { message: "hi" },
      });
      const acceptedBefore = (await events("mentorship.accepted")).length;
      const cancelledBefore = (await events("mentorship.cancelled")).length;

      const [accepted, cancelled] = await Promise.all([
        code(transition({ actor: actor(m), mentorshipId, action: "accept" })),
        code(transition({ actor: actor(s), mentorshipId, action: "cancel" })),
      ]);
      const row = await db.prisma.mentorship.findUniqueOrThrow({
        where: { id: mentorshipId },
      });
      const acceptedAfter =
        (await events("mentorship.accepted")).length - acceptedBefore;
      const cancelledAfter =
        (await events("mentorship.cancelled")).length - cancelledBefore;

      expect(
        accepted === "INVALID_STATE_TRANSITION" &&
          cancelled === "INVALID_STATE_TRANSITION"
      ).toBe(false);
      if (accepted === "ok" && cancelled === "ok") {
        expect(row.state).toBe("CANCELLED"); // accept committed, then cancel cancelled it
      } else if (accepted === "ok") {
        expect(row.state).toBe("ACCEPTED");
      } else {
        expect(cancelled).toBe("ok");
        expect(row.state).toBe("CANCELLED");
      }
      expect(acceptedAfter).toBe(accepted === "ok" ? 1 : 0);
      expect(cancelledAfter).toBe(cancelled === "ok" ? 1 : 0);
    }
  });

  it("full happy path REQUESTED → ACCEPTED → ACTIVE → COMPLETED writes 4 ordered events, timestamps satisfy the CHECKs", async () => {
    const { request, transition } = build();
    const m = await mentor("Mentor Happy");
    const s = await student("Student Happy");

    const { mentorshipId } = await request({
      actor: actor(s),
      mentorId: m,
      input: { message: "hi" },
    });
    await transition({ actor: actor(m), mentorshipId, action: "accept" });
    await transition({ actor: actor(m), mentorshipId, action: "start" });
    await transition({ actor: actor(m), mentorshipId, action: "complete" });

    const row = await db.prisma.mentorship.findUniqueOrThrow({
      where: { id: mentorshipId },
    });
    expect(row.state).toBe("COMPLETED");

    const rows = await events();
    expect(rows.map((r) => r.type)).toEqual([
      "mentorship.requested",
      "mentorship.accepted",
      "mentorship.started",
      "mentorship.completed",
    ]);
    for (const r of rows) {
      expect((r.payload as { mentorshipId: string }).mentorshipId).toBe(
        mentorshipId
      );
    }
  });

  it("after complete the pair may request again (history, not reuse) and the freed slot lets a refused accept succeed", async () => {
    const { request, transition } = build();
    const m = await mentor("Mentor Free", { maxMentees: 1 });
    const s1 = await student("Student One");
    const s2 = await student("Student Two");

    const first = await request({
      actor: actor(s1),
      mentorId: m,
      input: { message: "hi" },
    });
    const second = await request({
      actor: actor(s2),
      mentorId: m,
      input: { message: "hi" },
    });
    await transition({
      actor: actor(m),
      mentorshipId: first.mentorshipId,
      action: "accept",
    });
    await transition({
      actor: actor(m),
      mentorshipId: first.mentorshipId,
      action: "start",
    });
    expect(
      await code(
        transition({
          actor: actor(m),
          mentorshipId: second.mentorshipId,
          action: "accept",
        })
      )
    ).toBe("MENTOR_AT_CAPACITY");

    await transition({
      actor: actor(m),
      mentorshipId: first.mentorshipId,
      action: "complete",
    });
    const again = await request({
      actor: actor(s1),
      mentorId: m,
      input: { message: "more" },
    });
    expect(again.mentorshipId).not.toBe(first.mentorshipId);
    expect(
      await code(
        transition({
          actor: actor(m),
          mentorshipId: second.mentorshipId,
          action: "accept",
        })
      )
    ).toBe("ok");
    expect(await db.prisma.mentorship.count({ where: { menteeId: s1 } })).toBe(
      2
    );
  });

  it("atomicity: a store whose outbox.add throws leaves no new row and no state change", async () => {
    const { request: requestOk } = build();
    const m = await mentor("Mentor Atomic");
    const s = await student("Student Atomic");
    const { mentorshipId } = await requestOk({
      actor: actor(s),
      mentorId: m,
      input: { message: "hi" },
    });

    const failingOutbox = {
      add: async () => {
        throw new Error("outbox down");
      },
    };
    const { request: failingRequest, transition: failingTransition } =
      build(failingOutbox);
    const s2 = await student("Student Atomic 2");

    await expect(
      failingRequest({
        actor: actor(s2),
        mentorId: m,
        input: { message: "hi" },
      })
    ).rejects.toThrow("outbox down");
    expect(
      await db.prisma.mentorship.count({ where: { mentorId: m, menteeId: s2 } })
    ).toBe(0);

    await expect(
      failingTransition({ actor: actor(m), mentorshipId, action: "accept" })
    ).rejects.toThrow("outbox down");
    expect(
      (
        await db.prisma.mentorship.findUniqueOrThrow({
          where: { id: mentorshipId },
        })
      ).state
    ).toBe("REQUESTED");
  });

  it("after DECLINED the same student may request again; a mentor blocked-out reads NOT_FOUND; blocking after acceptance still lets the student cancel", async () => {
    const { request, transition } = build();
    const m = await mentor("Mentor Hist");
    const s = await student("Student Hist");

    const first = await request({
      actor: actor(s),
      mentorId: m,
      input: { message: "hi" },
    });
    await transition({
      actor: actor(m),
      mentorshipId: first.mentorshipId,
      action: "decline",
    });
    const second = await request({
      actor: actor(s),
      mentorId: m,
      input: { message: "again" },
    });
    expect(second.mentorshipId).not.toBe(first.mentorshipId);
    expect(
      await db.prisma.mentorship.count({ where: { mentorId: m, menteeId: s } })
    ).toBe(2);

    const blockedMentor = await mentor("Mentor Blocked");
    const blockedStudent = await student("Student Blocked");
    await link(blockedMentor, blockedStudent, "BLOCKED");
    expect(
      await code(
        request({
          actor: actor(blockedStudent),
          mentorId: blockedMentor,
          input: { message: "hi" },
        })
      )
    ).toBe("NOT_FOUND");

    const m3 = await mentor("Mentor Late Block");
    const s3 = await student("Student Late Block");
    const { mentorshipId } = await request({
      actor: actor(s3),
      mentorId: m3,
      input: { message: "hi" },
    });
    await transition({ actor: actor(m3), mentorshipId, action: "accept" });
    await link(m3, s3, "BLOCKED");
    expect(
      await code(
        transition({ actor: actor(m3), mentorshipId, action: "start" })
      )
    ).toBe("NOT_FOUND");
    expect(
      await code(
        transition({ actor: actor(s3), mentorshipId, action: "cancel" })
      )
    ).toBe("ok");
    expect(
      (
        await db.prisma.mentorship.findUniqueOrThrow({
          where: { id: mentorshipId },
        })
      ).state
    ).toBe("CANCELLED");
  });

  it("mentorContext.listable is false for a PRIVATE mentor, true for CONNECTIONS_ONLY once connected", async () => {
    const { request } = build();
    const privateMentor = await mentor("Mentor Private", {
      visibility: "PRIVATE",
    });
    const stu1 = await student("Student Private");
    expect(
      await code(
        request({
          actor: actor(stu1),
          mentorId: privateMentor,
          input: { message: "hi" },
        })
      )
    ).toBe("NOT_FOUND");

    const connMentor = await mentor("Mentor Conn Only", {
      visibility: "CONNECTIONS_ONLY",
    });
    const stu2 = await student("Student Conn Only");
    expect(
      await code(
        request({
          actor: actor(stu2),
          mentorId: connMentor,
          input: { message: "hi" },
        })
      )
    ).toBe("NOT_FOUND");

    await link(connMentor, stu2, "ACCEPTED");
    expect(
      await code(
        request({
          actor: actor(stu2),
          mentorId: connMentor,
          input: { message: "hi" },
        })
      )
    ).toBe("ok");
  });

  it("observe fires once per committed outcome and not when the transaction fails", async () => {
    const observe = vi.fn();
    const store = createPrismaMentorshipStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
    const request = createRequestMentorship({
      store,
      authorize,
      rateLimiter: allowAll,
      observe,
    });
    const transition = createTransitionMentorship({
      store,
      authorize,
      observe,
    });
    const m = await mentor("Mentor Observed");
    const s = await student("Student Observed");

    const { mentorshipId } = await request({
      actor: actor(s),
      mentorId: m,
      input: { message: "hi" },
    });
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenLastCalledWith("requested", mentorshipId);

    await transition({ actor: actor(m), mentorshipId, action: "accept" });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenLastCalledWith("accepted", mentorshipId);

    // Refused (accept on an already ACCEPTED row): the transaction fails, nothing is observed.
    await code(transition({ actor: actor(m), mentorshipId, action: "accept" }));
    expect(observe).toHaveBeenCalledTimes(2);
  });
});
