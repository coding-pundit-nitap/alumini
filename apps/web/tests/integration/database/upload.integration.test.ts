import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("upload table (real PostgreSQL)", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@example.test" },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await db.drop();
  });

  const row = (over: Record<string, unknown> = {}) => ({
    ownerId: userId,
    purpose: "PROFILE_PHOTO" as const,
    objectKey: "uploads/pending/abc",
    mime: "image/png",
    size: 1000,
    ...over,
  });

  it("accepts a valid pending upload", async () => {
    await db.prisma.upload.create({ data: row() });
  });

  it.each([
    ["size too large", { size: 5_242_881 }, "ck_upload_size"],
    ["size zero", { size: 0 }, "ck_upload_size"],
    ["mime not allowed", { mime: "application/pdf" }, "ck_upload_mime"],
  ] as const)("rejects %s", async (_label, over, constraint) => {
    const error = await db.prisma.upload
      .create({ data: row(over) })
      .catch((e) => e);
    expectConstraintViolation(error, constraint);
  });

  it("rejects a pending row whose key is not under uploads/pending/", async () => {
    const error = await db.prisma.upload
      .create({ data: row({ objectKey: "avatars/x/y.webp" }) })
      .catch((e) => e);
    expectConstraintViolation(error, "ck_upload_object_key_prefix");
  });

  it("accepts a READY row whose key is under avatars/", async () => {
    const upload = await db.prisma.upload.create({ data: row() });
    await db.prisma.upload.update({
      where: { id: upload.id },
      data: { status: "PENDING_SCAN" },
    });
    await db.prisma.upload.update({
      where: { id: upload.id },
      data: {
        status: "READY",
        objectKey: `avatars/${userId}/${upload.id}.webp`,
      },
    });
  });

  it("rejects a READY row whose key is still under uploads/pending/", async () => {
    const upload = await db.prisma.upload.create({ data: row() });
    await db.prisma.upload.update({
      where: { id: upload.id },
      data: { status: "PENDING_SCAN" },
    });
    const error = await db.prisma.upload
      .update({ where: { id: upload.id }, data: { status: "READY" } })
      .catch((e) => e);
    expectConstraintViolation(error, "ck_upload_object_key_prefix");
  });

  it("sets profile.photo_upload_id to null (never cascades) when the upload row is deleted", async () => {
    const upload = await db.prisma.upload.create({ data: row() });
    await db.prisma.profile.create({
      data: { userId, fullName: "Asha", photoUploadId: upload.id },
    });

    await db.prisma.upload.delete({ where: { id: upload.id } });

    const profile = await db.prisma.profile.findUniqueOrThrow({
      where: { userId },
    });
    expect(profile.photoUploadId).toBeNull();
  });

  it("deletes every upload row when the owning user is deleted", async () => {
    await db.prisma.upload.create({ data: row() });
    await db.prisma.user.delete({ where: { id: userId } });
    expect(await db.prisma.upload.count({ where: { ownerId: userId } })).toBe(
      0
    );
  });
});
