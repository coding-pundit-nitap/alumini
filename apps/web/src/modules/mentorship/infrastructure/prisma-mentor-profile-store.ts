import type { PrismaClient } from "@nitap/database";

import type { MentorProfileStore } from "../application/mentor-ports";

export function createPrismaMentorProfileStore(
  prisma: PrismaClient
): MentorProfileStore {
  return {
    async upsert(userId, input) {
      const row = await prisma.mentorProfile.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
      return {
        userId: row.userId,
        expertise: row.expertise,
        topics: row.topics,
        availability: row.availability,
        preferredContactMethod: row.preferredContactMethod,
        maxMentees: row.maxMentees,
        accepting: row.accepting,
      };
    },
  };
}
