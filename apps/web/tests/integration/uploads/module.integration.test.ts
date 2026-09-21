import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter, type OutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createFakeStoragePort } from "@nitap/storage";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createAuthorization } from "@/modules/auth/application/authorize";
import type { Actor } from "@/modules/auth/domain/actor";
import { createCompleteUpload } from "@/modules/uploads/application/complete-upload";
import { createPresignUpload } from "@/modules/uploads/application/presign-upload";
import { createSetProfilePhoto } from "@/modules/uploads/application/set-profile-photo";
import { createPrismaUploadStore } from "@/modules/uploads/infrastructure/prisma-upload-store";
import { createUpdateProfilePhoto } from "@/modules/users/application/update-profile-photo";
import { createPrismaProfileStore } from "@/modules/users/infrastructure/prisma-profile-store";

const { authorize } = createAuthorization({
  observer: { record() {} },
  now: () => new Date(),
});

const actor = (userId: string): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [
    { permission: "profile.read", scope: "GLOBAL", expiresAt: null },
    { permission: "profile.update", scope: "GLOBAL", expiresAt: null },
  ],
});

describe("uploads module against real PostgreSQL", () => {
  let db: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: {
        name: "Asha",
        email: "asha@example.test",
        accountState: "VERIFIED",
      },
    });
    userId = user.id;
    await db.prisma.profile.create({ data: { userId, fullName: "Asha" } });
  });

  afterEach(async () => {
    await db.drop();
  });

  function build(outboxOverride?: OutboxWriter) {
    const store = createPrismaUploadStore({
      runner: createTransactionRunner(db.prisma),
      outbox: outboxOverride ?? createOutboxWriter(),
    });
    const storage = createFakeStoragePort();
    return {
      store,
      presign: createPresignUpload({ store, authorize, storage }),
      complete: createCompleteUpload({ store, authorize, storage }),
      storage,
    };
  }

  it("presign creates a row visible in the database", async () => {
    const { presign } = build();
    const result = await presign({
      actor: actor(userId),
      mime: "image/png",
      size: 1000,
    });

    const row = await db.prisma.upload.findUniqueOrThrow({
      where: { id: result.uploadId },
    });
    expect(row).toMatchObject({
      ownerId: userId,
      status: "PENDING_UPLOAD",
      mime: "image/png",
      size: 1000,
    });
  });

  it("complete writes an outbox event for upload.scan in the same transaction as the status change", async () => {
    const { presign, complete, storage } = build();
    const { uploadId } = await presign({
      actor: actor(userId),
      mime: "image/png",
      size: 4,
    });
    const row = await db.prisma.upload.findUniqueOrThrow({
      where: { id: uploadId },
    });
    await storage.put(row.objectKey, Buffer.from("abcd"), "image/png");

    await complete({ actor: actor(userId), uploadId });

    const after = await db.prisma.upload.findUniqueOrThrow({
      where: { id: uploadId },
    });
    expect(after.status).toBe("PENDING_SCAN");
    const events = await db.prisma.outboxEvent.findMany({
      where: { type: "upload.scan" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ v: 1, uploadId });
  });

  it("rolls back the status change when the outbox write fails, in the same transaction", async () => {
    const { presign } = build();
    const { uploadId } = await presign({
      actor: actor(userId),
      mime: "image/png",
      size: 4,
    });

    const failingOutbox: OutboxWriter = {
      async add() {
        throw new Error("outbox down");
      },
    };
    const { store: failingStore } = build(failingOutbox);

    await expect(
      failingStore.transaction(async (tx) => {
        await tx.markPendingScan(uploadId);
        await tx.enqueueScan({ v: 1, uploadId });
      })
    ).rejects.toThrow("outbox down");

    const row = await db.prisma.upload.findUniqueOrThrow({
      where: { id: uploadId },
    });
    expect(row.status).toBe("PENDING_UPLOAD");
  });

  it("setProfilePhoto writes profile.photo_upload_id once the upload is READY", async () => {
    const { presign, store } = build();
    const { uploadId } = await presign({
      actor: actor(userId),
      mime: "image/png",
      size: 4,
    });
    await db.prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "READY",
        objectKey: `avatars/${userId}/${uploadId}.webp`,
      },
    });

    const updateProfilePhoto = createUpdateProfilePhoto({
      store: createPrismaProfileStore(db.prisma),
      authorize,
    });
    const setPhoto = createSetProfilePhoto({
      store,
      authorize,
      updateProfilePhoto,
    });

    await setPhoto({ actor: actor(userId), uploadId });

    const profile = await db.prisma.profile.findUniqueOrThrow({
      where: { userId },
    });
    expect(profile.photoUploadId).toBe(uploadId);
  });
});
