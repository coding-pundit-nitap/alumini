import { randomUUID } from "node:crypto";

import { Prisma } from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";

import { profileVisibilitySql } from "@/infrastructure/database/profile-visibility-sql";
import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  MentorshipStore,
  MentorshipTx,
} from "../application/mentorship-store";
import type { MentorshipRow } from "../domain/mentorship";
import { activeMentorSql } from "./active-mentor-sql";

const toRow = (r: MentorshipRow): MentorshipRow => ({ ...r });

/**
 * Open-pair uniqueness is enforced by the database (`uq_mentorship_open_pair`).
 * State changes are guarded updates, and outbox events share the transaction.
 */
export function createPrismaMentorshipStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): MentorshipStore {
  const forClient = (db: Prisma.TransactionClient): MentorshipTx => ({
    async findById(id) {
      const row = await db.mentorship.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async mentorContext(mentorId, menteeId) {
      const vis = profileVisibilitySql(menteeId);
      const rows = await db.$queryRaw<
        {
          accepting: boolean;
          maxMentees: number;
          openSlots: number;
          listable: boolean;
        }[]
      >`
        SELECT m.accepting, m.max_mentees AS "maxMentees",
               (SELECT count(*) FROM mentorship s
                 WHERE s.mentor_id = m.user_id AND s.state IN ('ACCEPTED', 'ACTIVE'))::int AS "openSlots",
               (${vis.visibleAt(Prisma.sql`p.visibility`, "p")} AND NOT ${vis.pairWith("p", "BLOCKED")}) AS listable
        FROM mentor_profile m
        JOIN profile p ON p.user_id = m.user_id
        JOIN "user" u ON u.id = m.user_id
        WHERE m.user_id = ${mentorId}::uuid AND ${activeMentorSql("u")}`;
      return rows[0] ?? null;
    },

    async lockMentorCapacity(mentorId) {
      // The row lock serialises concurrent accepts for this mentor: the count below cannot go stale.
      const locked = await db.$queryRaw<{ maxMentees: number }[]>`
        SELECT max_mentees AS "maxMentees" FROM mentor_profile WHERE user_id = ${mentorId}::uuid FOR UPDATE`;
      if (!locked[0]) return null;
      const openSlots = await db.mentorship.count({
        where: { mentorId, state: { in: ["ACCEPTED", "ACTIVE"] } },
      });
      return { maxMentees: locked[0].maxMentees, openSlots };
    },

    async blocked(a, b) {
      const [userAId, userBId] = [a.toLowerCase(), b.toLowerCase()].sort() as [
        string,
        string,
      ];
      const row = await db.connection.findUnique({
        where: { userAId_userBId: { userAId, userBId } },
        select: { state: true },
      });
      return row?.state === "BLOCKED";
    },

    async insert(input) {
      const id = randomUUID();
      const { count } = await db.mentorship.createMany({
        data: [{ id, ...input }],
        skipDuplicates: true, // ON CONFLICT DO NOTHING: covers the partial unique index too
      });
      if (count === 0) return null;
      const row = await db.mentorship.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async update(id, from, patch) {
      const { count } = await db.mentorship.updateMany({
        where: { id, state: from },
        data: patch,
      });
      if (count === 0) return null;
      const row = await db.mentorship.findUnique({ where: { id } });
      return row ? toRow(row) : null;
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
