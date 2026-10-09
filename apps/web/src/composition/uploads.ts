import "server-only";

import { loadStorageEnv, createS3StoragePort } from "@nitap/storage";

import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize } from "@/modules/auth";
import {
  createCompleteUpload,
  createGetUploadStatus,
  createPresignUpload,
  createPrismaUploadStore,
  createSetProfilePhoto,
} from "@/modules/uploads";

import { updateProfilePhoto } from "./users";

const store = createPrismaUploadStore({ runner: transactionRunner, outbox });
export const storage = createS3StoragePort(loadStorageEnv(process.env));

export const presignUpload = createPresignUpload({ store, authorize, storage });
export const completeUpload = createCompleteUpload({
  store,
  authorize,
  storage,
});
export const setProfilePhoto = createSetProfilePhoto({
  store,
  authorize,
  updateProfilePhoto,
});
export const getUploadStatus = createGetUploadStatus({ store, authorize });
