import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { createFakeUploadStore } from "../../../../tests/support/fake-upload-store";
import { createSetProfilePhoto } from "./set-profile-photo";
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
  objectKey: "avatars/u1/up1.webp",
  mime: "image/png",
  size: 1000,
  status: "READY",
  rejectReason: null,
  ...over,
});

function setup(seedRow: UploadRecord = row()) {
  const { store } = createFakeUploadStore([seedRow]);
  const updateProfilePhoto = vi.fn(async () => {});
  const setPhoto = createSetProfilePhoto({
    store,
    authorize: allow,
    updateProfilePhoto,
  });
  return { setPhoto, updateProfilePhoto };
}

describe("setProfilePhoto", () => {
  it("sets a READY, owned, PROFILE_PHOTO upload as the profile photo", async () => {
    const { setPhoto, updateProfilePhoto } = setup();
    await setPhoto({ actor: actor(), uploadId: "up1" });
    expect(updateProfilePhoto).toHaveBeenCalledWith({
      actor: actor(),
      photoUploadId: "up1",
    });
  });

  it("refuses an upload that is not yet READY", async () => {
    const { setPhoto, updateProfilePhoto } = setup(
      row({ status: "PENDING_SCAN" })
    );
    const error = await setPhoto({ actor: actor(), uploadId: "up1" }).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("UPLOAD_NOT_READY");
    expect(updateProfilePhoto).not.toHaveBeenCalled();
  });

  it("refuses a rejected upload", async () => {
    const { setPhoto } = setup(row({ status: "REJECTED" }));
    await expect(
      setPhoto({ actor: actor(), uploadId: "up1" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("another user's upload id is not-found (IDOR)", async () => {
    const { setPhoto, updateProfilePhoto } = setup();
    await expect(
      setPhoto({ actor: actor("someone-else"), uploadId: "up1" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateProfilePhoto).not.toHaveBeenCalled();
  });

  it("an unknown upload id is not-found", async () => {
    const { setPhoto } = setup();
    await expect(
      setPhoto({ actor: actor(), uploadId: "missing" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("requires a session", async () => {
    const { setPhoto } = setup();
    await expect(
      setPhoto({ actor: null, uploadId: "up1" })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
