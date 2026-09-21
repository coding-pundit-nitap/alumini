import type { Prisma, PrismaClient } from "@nitap/database";

import type {
  ListedMentorship,
  MentorshipQueries,
} from "../application/mentorship-store";

const counterparty = {
  select: {
    id: true,
    name: true,
    profile: { select: { fullName: true, photoUploadId: true } },
  },
} as const;

/** Reads for the caller's own lists. Writes live in `prisma-mentorship-store.ts`. */
export function createPrismaMentorshipQueries(
  prisma: PrismaClient
): MentorshipQueries {
  return {
    async list(userId, filter) {
      const and: Prisma.MentorshipWhereInput[] = [];
      if (filter.after) {
        const key = new Date(filter.after.key);
        and.push({
          OR: [
            { requestedAt: { lt: key } },
            { requestedAt: key, id: { gt: filter.after.id } },
          ],
        });
      }
      const rows = await prisma.mentorship.findMany({
        where: {
          ...(filter.role === "mentor"
            ? { mentorId: userId }
            : { menteeId: userId }),
          ...(filter.states ? { state: { in: filter.states } } : {}),
          AND: and,
        },
        orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
        take: filter.limit,
        include: { mentor: counterparty, mentee: counterparty },
      });

      return rows.map((row): ListedMentorship => {
        const other = filter.role === "mentor" ? row.mentee : row.mentor;
        return {
          id: row.id,
          state: row.state,
          counterparty: {
            id: other.id,
            fullName: other.profile?.fullName ?? other.name,
            hasPhoto: other.profile?.photoUploadId != null,
          },
          topic: row.topic,
          message: row.message,
          responseNote: row.responseNote,
          requestedAt: row.requestedAt,
          respondedAt: row.respondedAt,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
        };
      });
    },
  };
}
