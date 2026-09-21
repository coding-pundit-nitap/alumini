import { describe, expect, it } from "vitest";

import { createFakeStoragePort } from "@nitap/storage";

import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeUploadStore } from "../../../../tests/support/fake-upload-store";
import { MAX_OPEN_UPLOADS, MAX_UPLOAD_BYTES } from "../domain/upload-rules";
import { createPresignUpload } from "./presign-upload";

const actor = (accountState: Actor["accountState"] = "VERIFIED"): Actor => ({
  userId: "u1",
  accountState,
  requestId: "r",
  grants: [],
});
const allow = (a: Actor | null) => {
  if (!a) throw new AuthenticationError();
  return a;
};

function setup() {
  const { store, uploads } = createFakeUploadStore();
  const storage = createFakeStoragePort();
  const presign = createPresignUpload({ store, authorize: allow, storage });
  return { presign, uploads, storage };
}

describe("presignUpload", () => {
  it("creates a PENDING_UPLOAD row under uploads/pending/ and returns presign fields", async () => {
    const { presign, uploads } = setup();
    const result = await presign({
      actor: actor(),
      mime: "image/png",
      size: 1000,
    });

    expect(result.uploadId).toBeTruthy();
    expect(result.url).toBeTruthy();
    expect(result.fields).toBeTruthy();
    const row = uploads.get(result.uploadId);
    expect(row).toMatchObject({
      ownerId: "u1",
      purpose: "PROFILE_PHOTO",
      status: "PENDING_UPLOAD",
      mime: "image/png",
      size: 1000,
    });
    expect(row?.objectKey.startsWith("uploads/pending/")).toBe(true);
  });

  it("rejects a disallowed type before creating any row", async () => {
    const { presign, uploads } = setup();
    const error = await presign({
      actor: actor(),
      mime: "application/pdf",
      size: 1000,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details).toEqual([
      expect.objectContaining({
        field: "mime",
        code: "UPLOAD_TYPE_NOT_ALLOWED",
      }),
    ]);
    expect(uploads.size).toBe(0);
  });

  it("rejects a size over the cap before creating any row", async () => {
    const { presign, uploads } = setup();
    const error = await presign({
      actor: actor(),
      mime: "image/png",
      size: MAX_UPLOAD_BYTES + 1,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details).toEqual([
      expect.objectContaining({ field: "size", code: "UPLOAD_TOO_LARGE" }),
    ]);
    expect(uploads.size).toBe(0);
  });

  it("refuses a 6th open upload with 409 UPLOAD_LIMIT_REACHED", async () => {
    const { presign } = setup();
    for (let i = 0; i < MAX_OPEN_UPLOADS; i += 1) {
      await presign({ actor: actor(), mime: "image/png", size: 1000 });
    }
    const error = await presign({
      actor: actor(),
      mime: "image/png",
      size: 1000,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("UPLOAD_LIMIT_REACHED");
  });

  it("does not count another user's open uploads toward the caller's quota", async () => {
    const { store } = createFakeUploadStore();
    const storage = createFakeStoragePort();
    const presign = createPresignUpload({ store, authorize: allow, storage });
    for (let i = 0; i < MAX_OPEN_UPLOADS; i += 1) {
      await presign({
        actor: { ...actor(), userId: "other" },
        mime: "image/png",
        size: 1000,
      });
    }
    await expect(
      presign({ actor: actor(), mime: "image/png", size: 1000 })
    ).resolves.toBeDefined();
  });

  it("allows a PENDING account (profile.update is state-allowed)", async () => {
    const { presign } = setup();
    await expect(
      presign({ actor: actor("PENDING"), mime: "image/png", size: 1000 })
    ).resolves.toBeDefined();
  });

  it("requires a session", async () => {
    const { presign } = setup();
    await expect(
      presign({ actor: null, mime: "image/png", size: 1000 })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
