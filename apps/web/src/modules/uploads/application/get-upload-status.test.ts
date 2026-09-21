import { describe, expect, it } from "vitest";

import { AuthenticationError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeUploadStore } from "../../../../tests/support/fake-upload-store";
import { createGetUploadStatus } from "./get-upload-status";
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
  status: "PENDING_SCAN",
  rejectReason: null,
  ...over,
});

describe("getUploadStatus", () => {
  it("returns the caller's own upload status", async () => {
    const { store } = createFakeUploadStore([row()]);
    const get = createGetUploadStatus({ store, authorize: allow });
    expect(await get({ actor: actor(), uploadId: "up1" })).toEqual({
      status: "PENDING_SCAN",
      rejectReason: null,
    });
  });

  it("reports a rejection reason", async () => {
    const { store } = createFakeUploadStore([
      row({ status: "REJECTED", rejectReason: "bad image" }),
    ]);
    const get = createGetUploadStatus({ store, authorize: allow });
    expect(await get({ actor: actor(), uploadId: "up1" })).toEqual({
      status: "REJECTED",
      rejectReason: "bad image",
    });
  });

  it("another user's upload id is not-found (IDOR)", async () => {
    const { store } = createFakeUploadStore([row()]);
    const get = createGetUploadStatus({ store, authorize: allow });
    await expect(
      get({ actor: actor("someone-else"), uploadId: "up1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires a session", async () => {
    const { store } = createFakeUploadStore([row()]);
    const get = createGetUploadStatus({ store, authorize: allow });
    await expect(get({ actor: null, uploadId: "up1" })).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });
});
