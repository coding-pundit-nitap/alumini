import type { PrismaClient } from "@nitap/database";

import type { ProfileStore } from "../application/profile-store";
import type { ProfileRecord } from "../domain/profile";

/**
 * The only file that reads or writes `profile` for this module. It selects institutional data by NAME for
 * display and has no write path for it: those columns change only through the verification workflow.
 */
export function createPrismaProfileStore(prisma: PrismaClient): ProfileStore {
  return {
    async find(userId) {
      const row = await prisma.profile.findUnique({
        where: { userId },
        include: {
          department: { select: { name: true } },
          degree: { select: { name: true } },
        },
      });
      if (!row) return null;
      const record: ProfileRecord = {
        userId: row.userId,
        fullName: row.fullName,
        headline: row.headline,
        bio: row.bio,
        location: row.location,
        department: row.department?.name ?? null,
        degree: row.degree?.name ?? null,
        graduationYear: row.graduationYear,
        settings: {
          visibility: row.visibility,
          contact: row.contactVisibility,
          location: row.locationVisibility,
          experience: row.experienceVisibility,
          education: row.educationVisibility,
        },
      };
      return record;
    },

    async updateCore(userId, core) {
      const result = await prisma.profile.updateMany({
        where: { userId },
        data: {
          fullName: core.fullName,
          headline: core.headline,
          bio: core.bio,
          location: core.location,
        },
      });
      return result.count === 1;
    },

    async updatePrivacy(userId, settings) {
      const result = await prisma.profile.updateMany({
        where: { userId },
        data: {
          visibility: settings.visibility,
          contactVisibility: settings.contact,
          locationVisibility: settings.location,
          experienceVisibility: settings.experience,
          educationVisibility: settings.education,
        },
      });
      return result.count === 1;
    },
  };
}
