import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter, type OutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { ConflictError } from "@/lib/errors";
import { createAuthorization } from "@/modules/auth/application/authorize";
import { createDecideVerificationRequest } from "@/modules/auth/application/decide-verification-request";
import { createGetOwnVerification } from "@/modules/auth/application/get-own-verification";
import { createListPendingVerificationRequests } from "@/modules/auth/application/list-pending-verification-requests";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createSubmitVerificationRequest } from "@/modules/auth/application/submit-verification-request";
import type { Actor } from "@/modules/auth/domain/actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";
import { createPrismaVerificationStore } from "@/modules/auth/infrastructure/prisma-verification-store";
import { unavailableInstituteRecords } from "@/modules/auth/infrastructure/unavailable-institute-records";

const NOW = () => new Date();
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: NOW,
});
const allowAll = {
  async consume() {
    return { allowed: true, retryAfterSeconds: null };
  },
};

describe("alumni verification against real PostgreSQL", () => {
  let db: TestDatabase;
  let departmentId: string;
  let degreeId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    departmentId = (await db.prisma.department.findFirstOrThrow()).id;
    degreeId = (await db.prisma.degree.findFirstOrThrow()).id;
  });

  afterEach(async () => {
    await db.drop();
  });

  function build(overrides: { outbox?: OutboxWriter } = {}) {
    const store = createPrismaVerificationStore({
      runner: createTransactionRunner(db.prisma),
      prisma: db.prisma,
      outbox: overrides.outbox ?? createOutboxWriter(),
      audit: createAuditWriter(),
    });
    const policy = () => new Map();
    return {
      submit: createSubmitVerificationRequest({
        store,
        authorize,
        policy,
        rateLimiter: allowAll,
        instituteRecords: unavailableInstituteRecords,
      }),
      decide: createDecideVerificationRequest({
        store,
        authorize,
        now: NOW,
        approvalRole: "ALUMNI",
      }),
      list: createListPendingVerificationRequests({ store, authorize }),
      own: createGetOwnVerification({ store, authorize, policy }),
    };
  }

  async function applicant(email: string) {
    const user = await db.prisma.user.create({
      data: { name: "Asha Rao", email },
    });
    await db.prisma.profile.create({
      data: { userId: user.id, fullName: "Asha Rao" },
    });
    return user;
  }

  async function coordinator(email = "ravi@inst.test") {
    const user = await db.prisma.user.create({
      data: {
        name: "Ravi",
        email,
        emailVerified: true,
        accountState: "VERIFIED",
      },
    });
    const role = await db.prisma.role.findUniqueOrThrow({
      where: { name: "ALUMNI_COORDINATOR" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, grantedBy: user.id },
    });
    return user;
  }

  /** The actor exactly as getActor() would build it: from the database. */
  async function actorOf(userId: string): Promise<Actor> {
    const user = await db.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return resolveActor(
      { grantSource: createPrismaGrantSource(db.prisma), now: NOW },
      { userId, accountState: user.accountState },
      "req-int"
    );
  }

  const evidence = () => ({
    rollNumber: "NITAP-2019-042",
    departmentId,
    degreeId,
    graduationYear: 2019,
    supportingInfo: "Batch of 2019",
  });

  it("submit → approve: state, role, profile, audit and email commit together", async () => {
    const { submit, decide } = build();
    const asha = await applicant("asha@gmail.test");
    const ravi = await coordinator();

    const { requestId } = await submit({
      actor: await actorOf(asha.id),
      clientIp: "203.0.113.1",
      input: evidence(),
    });
    expect(
      await db.prisma.verificationRequest.findUniqueOrThrow({
        where: { id: requestId },
      })
    ).toMatchObject({
      status: "PENDING",
      crossCheck: "NOT_CHECKED",
      userId: asha.id,
    });

    await expect(
      decide({ actor: await actorOf(ravi.id), requestId, decision: "APPROVED" })
    ).resolves.toEqual({ outcome: "decided" });

    expect(
      await db.prisma.user.findUniqueOrThrow({ where: { id: asha.id } })
    ).toMatchObject({ accountState: "VERIFIED" });
    const roles = await db.prisma.userRole.findMany({
      where: { userId: asha.id },
      include: { role: true },
    });
    expect(roles.map((r) => [r.role.name, r.grantedBy])).toEqual([
      ["ALUMNI", ravi.id],
    ]);
    expect(
      await db.prisma.profile.findUniqueOrThrow({ where: { userId: asha.id } })
    ).toMatchObject({
      departmentId,
      degreeId,
      graduationYear: 2019,
    });
    expect(
      await db.prisma.verificationRequest.findUniqueOrThrow({
        where: { id: requestId },
      })
    ).toMatchObject({
      status: "APPROVED",
      reviewedBy: ravi.id,
    });
    const audits = await db.prisma.auditLog.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      "alumni.verified",
      "profile.institutional_changed",
    ]);
    expect(audits.find((a) => a.action === "alumni.verified")).toMatchObject({
      actorId: ravi.id,
      targetType: "user",
      targetId: asha.id,
      metadata: { requestId, crossCheck: "NOT_CHECKED" },
    });
    // / institutional changes are audited with old and new values.
    expect(
      audits.find((a) => a.action === "profile.institutional_changed")
    ).toMatchObject({
      actorId: ravi.id,
      targetType: "profile",
      targetId: asha.id,
      metadata: {
        from: { departmentId: null, degreeId: null, graduationYear: null },
        to: { departmentId, degreeId, graduationYear: 2019 },
      },
    });
    const emails = (
      await db.prisma.outboxEvent.findMany({ where: { type: "email.send" } })
    ).map((e) => e.payload);
    expect(emails).toEqual([
      {
        v: 1,
        to: "asha@gmail.test",
        template: "verification-approved",
        params: {},
      },
    ]);
    const decided = await db.prisma.outboxEvent.findMany({
      where: { type: "verification.decided" },
    });
    expect(decided.map((e) => e.payload)).toEqual([
      { v: 1, requestId, userId: asha.id, decision: "APPROVED" },
    ]);
  });

  it("a rejection leaves institutional fields alone; three rejections lock the account", async () => {
    const { submit, decide } = build();
    const asha = await applicant("asha@gmail.test");
    const ravi = await coordinator();

    for (let n = 0; n < 3; n += 1) {
      const { requestId } = await submit({
        actor: await actorOf(asha.id),
        clientIp: "203.0.113.1",
        input: evidence(),
      });
      await decide({
        actor: await actorOf(ravi.id),
        requestId,
        decision: "REJECTED",
        note: "Not found.",
      });
    }

    expect(
      await db.prisma.profile.findUniqueOrThrow({ where: { userId: asha.id } })
    ).toMatchObject({
      departmentId: null,
      degreeId: null,
      graduationYear: null,
    });
    await expect(
      build().submit({
        actor: await actorOf(asha.id),
        clientIp: "203.0.113.1",
        input: evidence(),
      })
    ).rejects.toMatchObject({ code: "VERIFICATION_LOCKED" });
    expect(await db.prisma.userRole.count({ where: { userId: asha.id } })).toBe(
      0
    );
  });

  it("rolls the whole decision back when the outbox write fails", async () => {
    const asha = await applicant("asha@gmail.test");
    const ravi = await coordinator();
    const { requestId } = await build().submit({
      actor: await actorOf(asha.id),
      clientIp: "203.0.113.1",
      input: evidence(),
    });
    const brokenOutbox: OutboxWriter = {
      add: async () => {
        throw new Error("outbox down");
      },
    };

    await expect(
      build({ outbox: brokenOutbox }).decide({
        actor: await actorOf(ravi.id),
        requestId,
        decision: "APPROVED",
      })
    ).rejects.toThrow("outbox down");

    expect(
      await db.prisma.verificationRequest.findUniqueOrThrow({
        where: { id: requestId },
      })
    ).toMatchObject({ status: "PENDING", reviewedBy: null });
    expect(
      await db.prisma.user.findUniqueOrThrow({ where: { id: asha.id } })
    ).toMatchObject({ accountState: "PENDING" });
    expect(await db.prisma.userRole.count({ where: { userId: asha.id } })).toBe(
      0
    );
    expect(await db.prisma.auditLog.count()).toBe(0);
    expect(await db.prisma.outboxEvent.count()).toBe(0);
  });

  it("two reviewers deciding at once produce exactly one decision", async () => {
    const asha = await applicant("asha@gmail.test");
    const ravi = await coordinator("ravi@inst.test");
    const meera = await coordinator("meera@inst.test");
    const { requestId } = await build().submit({
      actor: await actorOf(asha.id),
      clientIp: "203.0.113.1",
      input: evidence(),
    });
    const [a, b] = [await actorOf(ravi.id), await actorOf(meera.id)];

    const results = await Promise.all([
      build().decide({ actor: a, requestId, decision: "APPROVED" }),
      build().decide({ actor: b, requestId, decision: "APPROVED" }),
    ]);

    expect(results.map((r) => r.outcome).sort()).toEqual([
      "already_decided",
      "decided",
    ]);
    // Exactly one decision: one row of each audit action, not two of either.
    expect(
      (await db.prisma.auditLog.findMany()).map((a) => a.action).sort()
    ).toEqual(["alumni.verified", "profile.institutional_changed"]);
    expect(await db.prisma.userRole.count({ where: { userId: asha.id } })).toBe(
      1
    );
    // one email.send + one verification.decided
    expect(await db.prisma.outboxEvent.count()).toBe(2);
  });

  it("two simultaneous submissions produce one open request and one conflict", async () => {
    const asha = await applicant("asha@gmail.test");
    const actor = await actorOf(asha.id);

    const results = await Promise.allSettled([
      build().submit({ actor, clientIp: "203.0.113.1", input: evidence() }),
      build().submit({ actor, clientIp: "203.0.113.1", input: evidence() }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected"
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect(await db.prisma.verificationRequest.count()).toBe(1);
  });

  it("refuses a decision by the applicant's own reviewer account, in the use case and the database", async () => {
    const { decide } = build();
    const ravi = await coordinator();
    // A reviewer who is also an applicant: a PENDING row of their own (the database allows it).
    const own = await db.prisma.verificationRequest.create({
      data: {
        userId: ravi.id,
        rollNumber: "R",
        departmentId,
        degreeId,
        graduationYear: 2019,
      },
    });

    await expect(
      decide({
        actor: await actorOf(ravi.id),
        requestId: own.id,
        decision: "APPROVED",
      })
    ).rejects.toMatchObject({ code: "SELF_REVIEW_FORBIDDEN" });
    await expect(
      db.prisma.verificationRequest.update({
        where: { id: own.id },
        data: {
          status: "APPROVED",
          reviewedBy: ravi.id,
          reviewedAt: new Date(),
        },
      })
    ).rejects.toThrow(/ck_verification_reviewer_not_subject/);
  });

  it("a member without alumni.verify cannot decide or list", async () => {
    const { submit, decide, list } = build();
    const asha = await applicant("asha@gmail.test");
    const { requestId } = await submit({
      actor: await actorOf(asha.id),
      clientIp: "203.0.113.1",
      input: evidence(),
    });
    const member = await db.prisma.user.create({
      data: {
        name: "Member",
        email: "member@inst.test",
        accountState: "VERIFIED",
      },
    });

    await expect(
      decide({
        actor: await actorOf(member.id),
        requestId,
        decision: "APPROVED",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      list({ actor: await actorOf(member.id) })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("the queue lists pending requests oldest first, and a decided request leaves it", async () => {
    const { submit, decide, list } = build();
    const ravi = await coordinator();
    const ids: string[] = [];
    for (const email of ["a@gmail.test", "b@gmail.test"]) {
      const user = await applicant(email);
      ids.push(
        (
          await submit({
            actor: await actorOf(user.id),
            clientIp: `203.0.113.${ids.length}`,
            input: evidence(),
          })
        ).requestId
      );
    }

    const before = await list({ actor: await actorOf(ravi.id) });
    expect(before.items.map((i) => i.id)).toEqual(ids);
    expect(before.items[0]).toMatchObject({
      applicantEmail: "a@gmail.test",
      rollNumber: "NITAP-2019-042",
    });

    await decide({
      actor: await actorOf(ravi.id),
      requestId: ids[0]!,
      decision: "REJECTED",
      note: "No.",
    });
    expect(
      (await list({ actor: await actorOf(ravi.id) })).items.map((i) => i.id)
    ).toEqual([ids[1]]);
  });

  it("an applicant sees only their own request (IDOR)", async () => {
    const { submit, own } = build();
    const asha = await applicant("asha@gmail.test");
    const other = await applicant("other@gmail.test");
    await submit({
      actor: await actorOf(other.id),
      clientIp: "203.0.113.2",
      input: { ...evidence(), rollNumber: "OTHERS-ROLL" },
    });

    const mine = await own({ actor: await actorOf(asha.id) });

    expect(mine.latest).toBeNull();
    expect(JSON.stringify(mine)).not.toContain("OTHERS-ROLL");
  });
});
