"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  completeUpload,
  getUploadStatus,
  presignUpload,
  setProfilePhoto,
} from "@/composition/uploads";
import type { ActionResult } from "@/lib/action-result";
import { assertObjectInput } from "@/lib/form-data";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import type {
  CompleteUploadResult,
  PresignUploadResult,
  UploadStatusResult,
} from "@/modules/uploads";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUploadId(uploadId: string): string {
  if (!UUID.test(uploadId)) {
    throw new ValidationError({
      details: [
        {
          field: "uploadId",
          code: "INVALID",
          message: "That upload was not found.",
        },
      ],
    });
  }
  return uploadId;
}

/**
 * Called from client code with plain values. File bytes go straight to object
 * storage through the presigned URL, never through this process.
 */
export async function presignPhotoUploadAction(input: {
  mime: string;
  size: number;
}): Promise<ActionResult<PresignUploadResult>> {
  return runAction(async () => {
    assertObjectInput(input);
    return presignUpload({
      actor: await getActor(),
      mime: input.mime,
      size: input.size,
    });
  });
}

export async function completePhotoUploadAction(
  uploadId: string
): Promise<ActionResult<CompleteUploadResult>> {
  return runAction(async () =>
    completeUpload({
      actor: await getActor(),
      uploadId: parseUploadId(uploadId),
    })
  );
}

export async function getUploadStatusAction(
  uploadId: string
): Promise<ActionResult<UploadStatusResult>> {
  return runAction(async () =>
    getUploadStatus({
      actor: await getActor(),
      uploadId: parseUploadId(uploadId),
    })
  );
}

export async function setProfilePhotoAction(
  uploadId: string
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    await setProfilePhoto({
      actor: await getActor(),
      uploadId: parseUploadId(uploadId),
    });
    refresh();
    return { saved: true as const };
  });
}
