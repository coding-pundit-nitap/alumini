import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUploadStore } from "@nitap/database/uploads";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const store = createUploadStore();

describe("upload store (real PostgreSQL)", () => {
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

  const create = () =>
    store.create(db.prisma, {
      ownerId: userId,
      purpose: "PROFILE_PHOTO",
      objectKey: "uploads/pending/abc",
      mime: "image/png",
      size: 1000,
    });

  it("creates and finds a row", async () => {
    const created = await create();
    const found = await store.find(db.prisma, created.id);
    expect(found).toMatchObject({ ownerId: userId, status: "PENDING_UPLOAD" });
  });

  it("finds nothing for a missing id", async () => {
    expect(await store.find(db.prisma, crypto.randomUUID())).toBeNull();
  });

  it("counts PENDING_UPLOAD and PENDING_SCAN as open, but not READY or REJECTED", async () => {
    await create(); // stays PENDING_UPLOAD
    const scanning = await create();
    const ready = await create();
    const rejected = await create();
    await store.markPendingScan(db.prisma, scanning.id);
    await store.markPendingScan(db.prisma, ready.id);
    await store.markReady(
      db.prisma,
      ready.id,
      `avatars/${userId}/${ready.id}.webp`
    );
    await store.markRejected(db.prisma, rejected.id, "bad image");

    // The pending row plus the scanning row; READY and REJECTED are terminal, not open.
    expect(await store.countOpen(db.prisma, userId)).toBe(2);
  });

  it("markPendingScan only moves a PENDING_UPLOAD row, and only once", async () => {
    const upload = await create();
    expect(await store.markPendingScan(db.prisma, upload.id)).toBe(true);
    expect(await store.markPendingScan(db.prisma, upload.id)).toBe(false);
  });

  it("markReady rewrites the key and status together", async () => {
    const upload = await create();
    await store.markPendingScan(db.prisma, upload.id);
    const key = `avatars/${userId}/${upload.id}.webp`;
    await store.markReady(db.prisma, upload.id, key);
    const found = await store.find(db.prisma, upload.id);
    expect(found).toMatchObject({ status: "READY", objectKey: key });
  });

  it("markRejected records the reason and truncates an overlong one", async () => {
    const upload = await create();
    await store.markRejected(db.prisma, upload.id, "x".repeat(600));
    const found = await store.find(db.prisma, upload.id);
    expect(found?.status).toBe("REJECTED");
    expect(found?.rejectReason).toHaveLength(500);
  });

  it("listExpiredPending returns only old PENDING_UPLOAD rows, oldest first, bounded by limit", async () => {
    const old1 = await create();
    const old2 = await create();
    const recent = await create();
    const scanning = await create();
    await store.markPendingScan(db.prisma, scanning.id);
    await db.prisma.upload.update({
      where: { id: old1.id },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
    await db.prisma.upload.update({
      where: { id: old2.id },
      data: { createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
    });

    const expired = await store.listExpiredPending(
      db.prisma,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      10
    );
    expect(expired.map((r) => r.id)).toEqual([old1.id, old2.id]);
    expect(expired.map((r) => r.id)).not.toContain(recent.id);
    expect(expired.map((r) => r.id)).not.toContain(scanning.id);

    const limited = await store.listExpiredPending(
      db.prisma,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      1
    );
    expect(limited).toHaveLength(1);
  });

  it("remove deletes the row", async () => {
    const upload = await create();
    await store.remove(db.prisma, upload.id);
    expect(await store.find(db.prisma, upload.id)).toBeNull();
  });
});
