import type { Prisma } from "../generated/prisma/client.ts";

export type UploadStatus =
  "PENDING_UPLOAD" | "PENDING_SCAN" | "READY" | "REJECTED";

export type UploadRow = {
  id: string;
  ownerId: string;
  purpose: "PROFILE_PHOTO";
  objectKey: string;
  mime: string;
  size: number;
  status: UploadStatus;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Only the upload delegate is needed, so this works with any transaction client. */
export type UploadTransaction = Pick<Prisma.TransactionClient, "upload">;

export type NewUpload = {
  ownerId: string;
  purpose: "PROFILE_PHOTO";
  objectKey: string;
  mime: string;
  size: number;
};

/** Every method takes the caller's transaction; atomicity with outbox or audit writes is the caller's call. */
export type UploadStore = {
  create(tx: UploadTransaction, input: NewUpload): Promise<UploadRow>;
  find(tx: UploadTransaction, id: string): Promise<UploadRow | null>;
  /** PENDING_UPLOAD or PENDING_SCAN rows: the caller's open-upload quota. */
  countOpen(tx: UploadTransaction, ownerId: string): Promise<number>;
  /** Guarded: only a PENDING_UPLOAD row moves. False if the row was not in that state (or missing). */
  markPendingScan(tx: UploadTransaction, id: string): Promise<boolean>;
  /** Rewrites the key to the scanned derivative and marks READY, in one write (the CHECK ties them together). */
  markReady(
    tx: UploadTransaction,
    id: string,
    derivativeKey: string
  ): Promise<void>;
  markRejected(
    tx: UploadTransaction,
    id: string,
    reason: string
  ): Promise<void>;
  /** PENDING_UPLOAD rows older than `before`, oldest first, for the sweep. */
  listExpiredPending(
    tx: UploadTransaction,
    before: Date,
    limit: number
  ): Promise<UploadRow[]>;
  remove(tx: UploadTransaction, id: string): Promise<void>;
  /** How many rows wait for the scanner, and since when the oldest has. */
  scanBacklog(
    tx: UploadTransaction
  ): Promise<{ pending: number; oldestSince: Date | null }>;
};

export function createUploadStore(): UploadStore {
  return {
    async create(tx, input) {
      return tx.upload.create({ data: input });
    },

    async find(tx, id) {
      return tx.upload.findUnique({ where: { id } });
    },

    async countOpen(tx, ownerId) {
      return tx.upload.count({
        where: { ownerId, status: { in: ["PENDING_UPLOAD", "PENDING_SCAN"] } },
      });
    },

    async markPendingScan(tx, id) {
      const result = await tx.upload.updateMany({
        where: { id, status: "PENDING_UPLOAD" },
        data: { status: "PENDING_SCAN" },
      });
      return result.count === 1;
    },

    async markReady(tx, id, derivativeKey) {
      await tx.upload.update({
        where: { id },
        data: { status: "READY", objectKey: derivativeKey },
      });
    },

    async markRejected(tx, id, reason) {
      await tx.upload.update({
        where: { id },
        data: { status: "REJECTED", rejectReason: reason.slice(0, 500) },
      });
    },

    async listExpiredPending(tx, before, limit) {
      return tx.upload.findMany({
        where: { status: "PENDING_UPLOAD", createdAt: { lt: before } },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
    },

    async remove(tx, id) {
      await tx.upload.delete({ where: { id } });
    },

    // updated_at is when the row became PENDING_SCAN: nothing else writes a row in that state.
    async scanBacklog(tx) {
      const { _count, _min } = await tx.upload.aggregate({
        where: { status: "PENDING_SCAN" },
        _count: { _all: true },
        _min: { updatedAt: true },
      });
      return { pending: _count._all, oldestSince: _min.updatedAt };
    },
  };
}
