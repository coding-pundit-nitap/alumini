import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { avatarKey } from "@nitap/storage";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createPrismaBadgeStore } from "@/modules/users/infrastructure/prisma-badge-store";
import { createPrismaProfileStore } from "@/modules/users/infrastructure/prisma-profile-store";

const MISSING = "00000000-0000-4000-8000-000000000000";

describe("profile and badge stores against real PostgreSQL", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@example.test" },
    });
    userId = user.id;
    await db.prisma.profile.create({ data: { userId, fullName: "Asha" } });
  });
  afterEach(async () => {
    await db.drop();
  });

  it("reads every detail section in display order, dates as YYYY-MM-DD", async () => {
    await db.prisma.profileExperience.createMany({
      data: [
        {
          userId,
          company: "Old Co",
          designation: "Intern",
          startDate: new Date("2018-01-01"),
          endDate: new Date("2018-06-30"),
          isCurrent: false,
        },
        {
          userId,
          company: "Acme",
          designation: "Engineer",
          startDate: new Date("2020-01-01"),
          isCurrent: true,
        },
      ],
    });
    await db.prisma.profileEducation.create({
      data: {
        userId,
        institution: "NIT AP",
        qualification: "B.Tech",
        startYear: 2014,
        endYear: 2018,
      },
    });
    await db.prisma.profileSkill.create({ data: { userId, skill: "Go" } });
    await db.prisma.profileLink.create({
      data: { userId, type: "GITHUB", url: "https://github.com/asha" },
    });

    const record = await createPrismaProfileStore(db.prisma).find(userId);
    expect(record?.department).toBeNull();
    expect(
      record?.experience.map((e) => [e.company, e.startDate, e.endDate])
    ).toEqual([
      ["Acme", "2020-01-01", null],
      ["Old Co", "2018-01-01", "2018-06-30"],
    ]);
    expect(record?.education).toEqual([
      expect.objectContaining({ institution: "NIT AP", endYear: 2018 }),
    ]);
    expect(record?.skills.map((s) => s.skill)).toEqual(["Go"]);
    expect(record?.links).toEqual([
      expect.objectContaining({
        type: "GITHUB",
        url: "https://github.com/asha",
      }),
    ]);
  });

  it("reports a write to a member with no profile as not applied", async () => {
    const store = createPrismaProfileStore(db.prisma);
    expect(await store.find(MISSING)).toBeNull();
    expect(
      await store.updateCore(MISSING, {
        fullName: "x",
        headline: null,
        bio: null,
        location: null,
      })
    ).toBe(false);
    expect(await store.setPhoto(MISSING, null)).toBe(false);
  });

  it("serves the photo key only for a READY upload", async () => {
    const store = createPrismaProfileStore(db.prisma);
    expect(await store.findPhotoKey(userId)).toBeNull();

    const upload = await db.prisma.upload.create({
      data: {
        ownerId: userId,
        purpose: "PROFILE_PHOTO",
        objectKey: "uploads/pending/x",
        mime: "image/png",
        size: 100,
        status: "PENDING_SCAN",
      },
    });
    expect(await store.setPhoto(userId, upload.id)).toBe(true);
    expect(await store.findPhotoKey(userId)).toBeNull();

    await db.prisma.upload.update({
      where: { id: upload.id },
      data: { status: "READY", objectKey: `avatars/${userId}/x` },
    });
    expect(await store.findPhotoKey(userId)).toBe(avatarKey(userId, upload.id));
  });

  it("reads the badge choice with the member's roles, and writes only for a profile that exists", async () => {
    const store = createPrismaBadgeStore(db.prisma);
    expect(await store.readChoice(MISSING)).toBeNull();
    expect(await store.readChoice(userId)).toEqual({
      preference: null,
      roles: [],
    });

    const role = await db.prisma.role.findFirstOrThrow();
    await db.prisma.userRole.create({
      data: { userId, roleId: role.id, grantedBy: userId },
    });
    expect(await store.setChoice(userId, role.name)).toBe(true);
    expect(await store.readChoice(userId)).toEqual({
      preference: role.name,
      roles: [role.name],
    });
    expect(await store.setChoice(MISSING, null)).toBe(false);
  });
});
