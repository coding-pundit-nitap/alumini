import type { PrismaClient } from "@nitap/database";

import type { ProfileStore } from "../application/profile-store";
import type { ProfileRecord } from "../domain/profile";

/** A `date` column arrives as a UTC-midnight Date; the domain speaks YYYY-MM-DD. */
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

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
          // Fixed display order (spec 3B E-7): current roles first, newest first; ongoing study first.
          experience: {
            orderBy: [
              { isCurrent: "desc" },
              { startDate: "desc" },
              { id: "asc" },
            ],
          },
          education: {
            orderBy: [
              { endYear: { sort: "desc", nulls: "first" } },
              { startYear: "desc" },
              { id: "asc" },
            ],
          },
          skills: { orderBy: [{ skill: "asc" }, { id: "asc" }] },
          links: {
            orderBy: [{ type: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          },
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
        photoUploadId: row.photoUploadId,
        experience: row.experience.map((e) => ({
          id: e.id,
          company: e.company,
          industry: e.industry,
          designation: e.designation,
          startDate: isoDate(e.startDate),
          endDate: e.endDate ? isoDate(e.endDate) : null,
          isCurrent: e.isCurrent,
        })),
        education: row.education.map((e) => ({
          id: e.id,
          institution: e.institution,
          qualification: e.qualification,
          fieldOfStudy: e.fieldOfStudy,
          startYear: e.startYear,
          endYear: e.endYear,
        })),
        skills: row.skills.map((k) => ({ id: k.id, skill: k.skill })),
        links: row.links.map((l) => ({ id: l.id, type: l.type, url: l.url })),
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

    async setPhoto(userId, photoUploadId) {
      const result = await prisma.profile.updateMany({
        where: { userId },
        data: { photoUploadId },
      });
      return result.count === 1;
    },
  };
}
