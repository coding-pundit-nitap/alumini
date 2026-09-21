import { describe, expect, it, vi } from "vitest";

import { createFakeStoragePort } from "@nitap/storage";

import { silentLogger } from "../../tests/support.ts";
import { createUploadSweepProcessor } from "./upload-sweep.ts";
import type { UploadSweepStore, UploadSweepStoreRow } from "./upload-sweep.ts";

const context = () => ({
  jobId: "job-1",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
});

function fakeStore(batches: UploadSweepStoreRow[][]): UploadSweepStore & {
  removed: string[];
} {
  const removed: string[] = [];
  let call = 0;
  return {
    removed,
    async listExpiredPending() {
      const batch = batches[call] ?? [];
      call += 1;
      return batch;
    },
    async remove(id) {
      removed.push(id);
    },
  };
}

describe("upload.sweep processor", () => {
  it("deletes the object (best-effort) and the row for each expired PENDING_UPLOAD", async () => {
    const rows: UploadSweepStoreRow[] = [
      { id: "a", objectKey: "uploads/pending/a" },
      { id: "b", objectKey: "uploads/pending/b" },
    ];
    const storage = createFakeStoragePort();
    await storage.put("uploads/pending/a", Buffer.alloc(1), "image/png");
    await storage.put("uploads/pending/b", Buffer.alloc(1), "image/png");
    const store = fakeStore([rows, []]);

    await createUploadSweepProcessor({ store, storage })({ v: 1 }, context());

    expect(store.removed.sort()).toEqual(["a", "b"]);
    await expect(storage.get("uploads/pending/a")).rejects.toThrow();
    await expect(storage.get("uploads/pending/b")).rejects.toThrow();
  });

  it("still removes the row when the object is already gone (best-effort delete)", async () => {
    const rows: UploadSweepStoreRow[] = [
      { id: "a", objectKey: "uploads/pending/a" },
    ];
    const storage = createFakeStoragePort(); // never had the object put into it
    const store = fakeStore([rows, []]);

    await createUploadSweepProcessor({ store, storage })({ v: 1 }, context());

    expect(store.removed).toEqual(["a"]);
  });

  it("walks multiple batches until a short one ends the run", async () => {
    const batch1: UploadSweepStoreRow[] = Array.from({ length: 3 }, (_, i) => ({
      id: `b1-${i}`,
      objectKey: `uploads/pending/b1-${i}`,
    }));
    const batch2: UploadSweepStoreRow[] = Array.from({ length: 1 }, (_, i) => ({
      id: `b2-${i}`,
      objectKey: `uploads/pending/b2-${i}`,
    }));
    const storage = createFakeStoragePort();
    const store = fakeStore([batch1, batch2]);
    const listExpiredPending = vi.spyOn(store, "listExpiredPending");

    await createUploadSweepProcessor({ store, storage, batchSize: 3 })(
      { v: 1 },
      context()
    );

    expect(store.removed).toHaveLength(4);
    expect(listExpiredPending).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there is nothing expired", async () => {
    const storage = createFakeStoragePort();
    const store = fakeStore([[]]);
    await createUploadSweepProcessor({ store, storage })({ v: 1 }, context());
    expect(store.removed).toEqual([]);
  });
});
