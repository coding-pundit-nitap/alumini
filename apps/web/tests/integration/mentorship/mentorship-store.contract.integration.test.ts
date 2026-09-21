import { randomUUID } from "node:crypto";

import { afterEach } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type {
  MentorshipEvent,
  MentorshipTx,
} from "@/modules/mentorship/application/mentorship-store";
import { createPrismaMentorshipStore } from "@/modules/mentorship/infrastructure/prisma-mentorship-store";

import {
  describeMentorshipStoreContract,
  type MentorshipStoreHarness,
} from "../../support/mentorship-store.contract";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds the same contract harness the fake store satisfies, but backed by real PostgreSQL. The contract
 * suite's ids ("mentor-1", "mentee-1", …) are not valid uuids, so every id-shaped argument is resolved
 * through an alias table (real random uuid per test id, generated on first use) before it reaches the real
 * store. Seed calls are synchronous per the harness type, so they are queued and flushed before every
 * `store.transaction` call — the suite never awaits them directly.
 */
function buildHarness(db: TestDatabase): MentorshipStoreHarness {
  const alias = new Map<string, string>();
  const resolve = (id: string): string => {
    if (UUID_RE.test(id)) return id;
    const existing = alias.get(id);
    if (existing) return existing;
    const real = randomUUID();
    alias.set(id, real);
    return real;
  };

  let pending: Promise<unknown> = Promise.resolve();
  const queue = (work: () => Promise<unknown>) => {
    pending = pending.then(work);
  };

  let grantorId: string | undefined;
  let alumniRoleId: string | undefined;
  async function ensureGrantorAndRole() {
    grantorId ??= (
      await db.prisma.user.create({
        data: {
          name: "Grantor",
          email: `grantor-${randomUUID()}@example.test`,
          accountState: "VERIFIED",
        },
      })
    ).id;
    alumniRoleId ??= (
      await db.prisma.role.findUniqueOrThrow({ where: { name: "ALUMNI" } })
    ).id;
  }

  async function ensureUser(testId: string): Promise<string> {
    const id = resolve(testId);
    const existing = await db.prisma.user.findUnique({ where: { id } });
    if (existing) return id;
    await db.prisma.user.create({
      data: {
        id,
        name: testId,
        email: `${id}@example.test`,
        accountState: "VERIFIED",
      },
    });
    await db.prisma.profile.create({
      data: { userId: id, fullName: testId, visibility: "MEMBERS_ONLY" },
    });
    return id;
  }

  const realStore = createPrismaMentorshipStore({
    runner: createTransactionRunner(db.prisma),
    outbox: createOutboxWriter(),
  });

  const wrapTx = (tx: MentorshipTx): MentorshipTx => ({
    findById: (id) => tx.findById(resolve(id)),
    mentorContext: (mentorId, menteeId) =>
      tx.mentorContext(resolve(mentorId), resolve(menteeId)),
    lockMentorCapacity: (mentorId) => tx.lockMentorCapacity(resolve(mentorId)),
    blocked: (a, b) => tx.blocked(resolve(a), resolve(b)),
    insert: (input) =>
      tx.insert({
        ...input,
        mentorId: resolve(input.mentorId),
        menteeId: resolve(input.menteeId),
      }),
    update: (id, from, patch) => tx.update(resolve(id), from, patch),
    enqueue: (event) =>
      tx.enqueue({
        type: event.type,
        payload: {
          ...event.payload,
          mentorshipId: resolve(event.payload.mentorshipId),
          mentorId: resolve(event.payload.mentorId),
          menteeId: resolve(event.payload.menteeId),
          actorId: resolve(event.payload.actorId),
        },
      }),
  });

  return {
    store: {
      transaction: async (work) => {
        await pending;
        return realStore.transaction((tx) => work(wrapTx(tx)));
      },
    },
    seedUser(id) {
      queue(() => ensureUser(id));
    },
    seedMentor(id, config) {
      queue(async () => {
        await ensureGrantorAndRole();
        const userId = await ensureUser(id);
        await db.prisma.userRole.create({
          data: { userId, roleId: alumniRoleId!, grantedBy: grantorId! },
        });
        await db.prisma.mentorProfile.create({
          data: {
            userId,
            expertise: "General mentorship",
            accepting: config.accepting,
            maxMentees: config.maxMentees,
          },
        });
        await db.prisma.profile.update({
          where: { userId },
          data: { visibility: config.listable ? "MEMBERS_ONLY" : "PRIVATE" },
        });
      });
    },
    seedBlock(a, b) {
      queue(async () => {
        const [idA, idB] = await Promise.all([ensureUser(a), ensureUser(b)]);
        const [userAId, userBId] = [idA, idB].sort() as [string, string];
        await db.prisma.connection.create({
          data: {
            userAId,
            userBId,
            requestedById: userAId,
            blockedById: userAId,
            state: "BLOCKED",
            respondedAt: new Date(),
          },
        });
      });
    },
    openSlotsTaker(mentorId, n) {
      queue(async () => {
        const mentor = resolve(mentorId);
        for (let i = 0; i < n; i += 1) {
          const menteeId = await ensureUser(`${mentorId}-slot-${i}`);
          await db.prisma.mentorship.create({
            data: {
              mentorId: mentor,
              menteeId,
              state: "ACCEPTED",
              message: "seed",
              respondedAt: new Date(),
            },
          });
        }
      });
    },
    events: async (): Promise<MentorshipEvent[]> => {
      await pending;
      const rows = await db.prisma.outboxEvent.findMany({
        orderBy: { createdAt: "asc" },
        where: { type: { startsWith: "mentorship." } },
      });
      return rows.map((r) => ({
        type: r.type,
        payload: r.payload,
      })) as MentorshipEvent[];
    },
  };
}

let db: TestDatabase | undefined;
afterEach(async () => {
  await db?.drop();
  db = undefined;
});

describeMentorshipStoreContract("prisma store", async () => {
  db = await createTestDatabase();
  await runSeed(db.prisma);
  return buildHarness(db);
});
