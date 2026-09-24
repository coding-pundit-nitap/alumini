import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createAuthorization } from "@/modules/auth/application/authorize";
import { createListPendingVerificationRequests } from "@/modules/auth/application/list-pending-verification-requests";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import type { Actor } from "@/modules/auth/domain/actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";
import { createPrismaVerificationStore } from "@/modules/auth/infrastructure/prisma-verification-store";

const NOW = () => new Date();
const { authorize } = createAuthorization({
  observer: { record() {} },
  now: NOW,
});

describe("pending queue applicant history against real PostgreSQL", () => {
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

  function build() {
    const store = createPrismaVerificationStore({
      runner: createTransactionRunner(db.prisma),
      prisma: db.prisma,
      outbox: createOutboxWriter(),
      audit: createAuditWriter(),
    });
    return {
      list: createListPendingVerificationRequests({ store, authorize }),
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

  it("lists a re-submitted request with the applicant's earlier rejection, newest first", async () => {
    const { list } = build();
    const ravi = await coordinator();
    const verifier = await actorOf(ravi.id);
    const user = await applicant("repeat@gmail.test");
    const base = {
      userId: user.id,
      rollNumber: "R1",
      departmentId,
      degreeId,
      graduationYear: 2019,
    };
    await db.prisma.verificationRequest.create({
      data: {
        ...base,
        status: "REJECTED",
        reviewedAt: new Date("2026-08-01T00:00:00Z"),
        reviewNote: "blurry",
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    });
    await db.prisma.verificationRequest.create({
      data: { ...base, createdAt: new Date("2026-09-01T00:00:00Z") },
    });
    const page = await list({ actor: verifier });
    const item = page.items.find((i) => i.userId === user.id)!;
    expect(item.history).toEqual([
      {
        status: "REJECTED",
        decidedAt: new Date("2026-08-01T00:00:00Z"),
        note: "blurry",
      },
    ]);
  });
});
