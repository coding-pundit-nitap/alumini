import { Prisma, type AccountState, type PrismaClient } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";
import { ConflictError } from "@/lib/errors";

import type {
  PendingVerification,
  VerificationRequestRecord,
  VerificationStore,
  VerificationTx,
} from "../application/verification-store";

type Deps = {
  runner: Pick<TransactionRunner, "run">;
  prisma: PrismaClient;
  outbox: OutboxWriter;
  audit: AuditWriter;
};

type Row = {
  id: string;
  userId: string;
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
  supportingInfo: string | null;
  status: VerificationRequestRecord["status"];
  crossCheck: VerificationRequestRecord["crossCheck"];
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
};

const toRecord = (row: Row): VerificationRequestRecord => ({ ...row });

function createTx(tx: Prisma.TransactionClient, deps: Deps): VerificationTx {
  return {
    findAccount: (userId) =>
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, accountState: true },
      }),

    async findRequest(id) {
      const row = await tx.verificationRequest.findUnique({ where: { id } });
      return row && toRecord(row);
    },

    async latestRequest(userId) {
      const row = await tx.verificationRequest.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return row && toRecord(row);
    },

    countRejected: (userId) =>
      tx.verificationRequest.count({ where: { userId, status: "REJECTED" } }),

    async createRequest(input) {
      try {
        const row = await tx.verificationRequest.create({
          data: input,
          select: { id: true },
        });
        return { id: row.id };
      } catch (error) {
        // uq_verification_one_open: the unique index is the backstop for two concurrent submissions.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new ConflictError("VERIFICATION_REQUEST_OPEN", {
            cause: error,
          });
        }
        throw error;
      }
    },

    // The WHERE makes the decision atomic: only one caller can move a request out of PENDING.
    async decideRequest({ id, decision, reviewerId, note, now }) {
      const result = await tx.verificationRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: decision,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewNote: note,
        },
      });
      return result.count === 1;
    },

    async setAccountState(userId, from, to) {
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          accountState: { in: [...from] as AccountState[] },
        },
        data: { accountState: to as AccountState },
      });
      return result.count === 1;
    },

    // FR-PROFILE-004: institutional fields change only through this workflow.
    async applyInstitutionalFields(userId, fields) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      });
      const before = await tx.profile.findUnique({
        where: { userId },
        select: { departmentId: true, degreeId: true, graduationYear: true },
      });
      await tx.profile.upsert({
        where: { userId },
        create: { userId, fullName: user.name, ...fields },
        update: fields,
      });
      return (
        before ?? { departmentId: null, degreeId: null, graduationYear: null }
      );
    },

    async assignRole(userId, roleName, grantedBy) {
      const role = await tx.role.findUniqueOrThrow({
        where: { name: roleName },
        select: { id: true },
      });
      await tx.userRole.createMany({
        data: [{ userId, roleId: role.id, grantedBy }],
        skipDuplicates: true,
      });
    },

    async enqueueEmail(payload) {
      await deps.outbox.add(tx, { type: "email.send", payload });
    },

    async recordAudit(entry) {
      await deps.audit.record(tx, entry);
    },
  };
}

export function createPrismaVerificationStore(deps: Deps): VerificationStore {
  return {
    transaction: (work) => deps.runner.run((tx) => work(createTx(tx, deps))),

    async listReferenceOptions() {
      const [departments, degrees] = await Promise.all([
        deps.prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        deps.prisma.degree.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return { departments, degrees };
    },

    async listPending({ after, limit }) {
      const rows = await deps.prisma.verificationRequest.findMany({
        where: {
          status: "PENDING",
          ...(after
            ? {
                OR: [
                  { createdAt: { gt: after.createdAt } },
                  { createdAt: after.createdAt, id: { gt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
          department: { select: { name: true } },
          degree: { select: { name: true } },
        },
      });
      return rows.map((row): PendingVerification => ({
        id: row.id,
        submittedAt: row.createdAt,
        applicantName: row.user.name,
        applicantEmail: row.user.email,
        rollNumber: row.rollNumber,
        departmentName: row.department.name,
        degreeName: row.degree.name,
        graduationYear: row.graduationYear,
        supportingInfo: row.supportingInfo,
        crossCheck: row.crossCheck,
      }));
    },
  };
}
