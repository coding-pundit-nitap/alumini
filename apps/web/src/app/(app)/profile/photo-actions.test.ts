import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  getActor: vi.fn(),
  presignUpload: vi.fn(),
  completeUpload: vi.fn(),
  getUploadStatus: vi.fn(),
  setProfilePhoto: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/uploads", () => ({
  presignUpload: mocks.presignUpload,
  completeUpload: mocks.completeUpload,
  getUploadStatus: mocks.getUploadStatus,
  setProfilePhoto: mocks.setProfilePhoto,
}));

import { AuthorizationError } from "@/lib/errors";

import {
  completePhotoUploadAction,
  getUploadStatusAction,
  presignPhotoUploadAction,
  setProfilePhotoAction,
} from "./photo-actions";

const actor = { userId: "u1", accountState: "VERIFIED" };
const validId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.presignUpload.mockReset().mockResolvedValue({
    uploadId: validId,
    url: "https://minio/bucket",
    fields: {},
  });
  mocks.completeUpload
    .mockReset()
    .mockResolvedValue({ status: "PENDING_SCAN" });
  mocks.getUploadStatus.mockReset().mockResolvedValue({
    status: "READY",
    rejectReason: null,
  });
  mocks.setProfilePhoto.mockReset().mockResolvedValue(undefined);
});

describe("presignPhotoUploadAction", () => {
  it("calls the use case with the session's actor and the declared type and size", async () => {
    const result = await presignPhotoUploadAction({
      mime: "image/png",
      size: 1000,
    });
    expect(result).toEqual({
      ok: true,
      data: { uploadId: validId, url: "https://minio/bucket", fields: {} },
    });
    expect(mocks.presignUpload).toHaveBeenCalledWith({
      actor,
      mime: "image/png",
      size: 1000,
    });
  });

  it("surfaces a denial", async () => {
    mocks.presignUpload.mockRejectedValue(new AuthorizationError());
    expect(
      await presignPhotoUploadAction({ mime: "image/png", size: 1000 })
    ).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
  });
});

describe("completePhotoUploadAction", () => {
  it("calls the use case with a valid upload id", async () => {
    const result = await completePhotoUploadAction(validId);
    expect(result).toEqual({ ok: true, data: { status: "PENDING_SCAN" } });
    expect(mocks.completeUpload).toHaveBeenCalledWith({
      actor,
      uploadId: validId,
    });
  });

  it("rejects a malformed id without calling the use case", async () => {
    const result = await completePhotoUploadAction("not-a-uuid");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.completeUpload).not.toHaveBeenCalled();
  });
});

describe("getUploadStatusAction", () => {
  it("calls the use case with a valid upload id", async () => {
    const result = await getUploadStatusAction(validId);
    expect(result).toEqual({
      ok: true,
      data: { status: "READY", rejectReason: null },
    });
    expect(mocks.getUploadStatus).toHaveBeenCalledWith({
      actor,
      uploadId: validId,
    });
  });
});

describe("setProfilePhotoAction", () => {
  it("calls the use case and refreshes the page", async () => {
    const result = await setProfilePhotoAction(validId);
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(mocks.setProfilePhoto).toHaveBeenCalledWith({
      actor,
      uploadId: validId,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("rejects a malformed id without calling the use case or refreshing", async () => {
    const result = await setProfilePhotoAction("not-a-uuid");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(mocks.setProfilePhoto).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
