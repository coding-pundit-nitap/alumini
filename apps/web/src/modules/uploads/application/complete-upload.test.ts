import { describe, expect, it } from "vitest";

import { createFakeStoragePort } from "@nitap/storage";
import type { StoragePort } from "@nitap/storage";

import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeUploadStore } from "../../../../tests/support/fake-upload-store";
import { createCompleteUpload } from "./complete-upload";
import type { UploadRecord } from "./upload-store";

const actor = (userId = "u1"): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

const row = (over: Partial<UploadRecord> = {}): UploadRecord => ({
  id: "up1",
  ownerId: "u1",
  purpose: "PROFILE_PHOTO",
  objectKey: "uploads/pending/up1",
  mime: "image/png",
  size: 1000,
  status: "PENDING_UPLOAD",
  rejectReason: null,
  ...over,
});

async function setup(
  seedRow: UploadRecord = row(),
  storageOverride?: StoragePort
) {
  const { store, uploads, scans } = createFakeUploadStore([seedRow]);
  const storage = storageOverride ?? createFakeStoragePort();
  if (!storageOverride) {
    await storage.put(
      seedRow.objectKey,
      Buffer.alloc(seedRow.size),
      seedRow.mime
    );
  }
  const complete = createCompleteUpload({ store, authorize: allow, storage });
  return { complete, uploads, scans, storage };
}

describe("completeUpload", () => {
  it("moves PENDING_UPLOAD to PENDING_SCAN and enqueues the scan job, in one step", async () => {
    const { complete, uploads, scans } = await setup();
    const result = await complete({ actor: actor(), uploadId: "up1" });
    expect(result).toEqual({ status: "PENDING_SCAN" });
    expect(uploads.get("up1")?.status).toBe("PENDING_SCAN");
    expect(scans).toEqual([{ v: 1, uploadId: "up1" }]);
  });

  it("is idempotent: completing an already-PENDING_SCAN upload is a no-op success", async () => {
    const { complete, scans } = await setup(row({ status: "PENDING_SCAN" }));
    const result = await complete({ actor: actor(), uploadId: "up1" });
    expect(result).toEqual({ status: "PENDING_SCAN" });
    expect(scans).toEqual([]);
  });

  it("is idempotent for a READY upload too: no error, no re-enqueue", async () => {
    const { complete, scans } = await setup(row({ status: "READY" }));
    const result = await complete({ actor: actor(), uploadId: "up1" });
    expect(result).toEqual({ status: "READY" });
    expect(scans).toEqual([]);
  });

  it("rejects with 400 UPLOAD_MISMATCH when the stored size differs from what was declared", async () => {
    const seed = row({ size: 1000 });
    const storage = createFakeStoragePort();
    await storage.put(seed.objectKey, Buffer.alloc(5), seed.mime); // 5 bytes, not 1000
    const { complete, uploads } = await setup(seed, storage);

    const error = await complete({ actor: actor(), uploadId: "up1" }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe("UPLOAD_MISMATCH");
    expect(uploads.get("up1")?.status).toBe("PENDING_UPLOAD");
  });

  it("rejects with 400 UPLOAD_MISMATCH when the stored content type differs", async () => {
    const seed = row({ mime: "image/png" });
    const storage = createFakeStoragePort();
    await storage.put(seed.objectKey, Buffer.alloc(seed.size), "image/jpeg");
    const { complete } = await setup(seed, storage);

    const error = await complete({ actor: actor(), uploadId: "up1" }).catch(
      (e) => e
    );
    expect(error.code).toBe("UPLOAD_MISMATCH");
  });

  it("another user's upload id is not-found (IDOR)", async () => {
    const { complete } = await setup();
    await expect(
      complete({ actor: actor("someone-else"), uploadId: "up1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an unknown upload id is not-found", async () => {
    const { complete } = await setup();
    await expect(
      complete({ actor: actor(), uploadId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("propagates a storage outage without touching the row", async () => {
    const seed = row();
    const storage: StoragePort = {
      ...createFakeStoragePort({ failWith: "unavailable" }),
    };
    const { store } = createFakeUploadStore([seed]);
    const complete = createCompleteUpload({ store, authorize: allow, storage });
    await expect(
      complete({ actor: actor(), uploadId: "up1" })
    ).rejects.toThrow();
  });

  it("requires a session", async () => {
    const { complete } = await setup();
    await expect(
      complete({ actor: null, uploadId: "up1" })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
