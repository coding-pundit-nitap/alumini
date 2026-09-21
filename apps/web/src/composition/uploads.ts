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

/**
 * Wires the uploads module to its adapters. Storage is used directly here (spec 3C F-6: the one place
 * both web and the worker legitimately talk to `@nitap/storage`, unlike queue/email which are
 * worker-only, ADR-018).
 */
const store = createPrismaUploadStore({ runner: transactionRunner, outbox });
const storage = createS3StoragePort(loadStorageEnv(process.env));

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
