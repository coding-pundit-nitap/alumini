import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { avatarKey, createFakeStoragePort, StorageError } from "@nitap/storage";
import type { StoragePort } from "@nitap/storage";

import { silentLogger } from "../../tests/support.ts";
import { passthroughScanner } from "../scanner.ts";
import type { ScannerPort } from "../scanner.ts";
import { createUploadScanProcessor } from "./upload-scan.ts";
import type { UploadScanStoreRow, UploadScanStore } from "./upload-scan.ts";

const context = (over: Record<string, unknown> = {}) => ({
  jobId: "job-1",
  attempt: 1,
  requestId: "req-1",
  signal: new AbortController().signal,
  logger: silentLogger(),
  ...over,
});

function fakeStore(row: UploadScanStoreRow | null): UploadScanStore & {
  ready: { id: string; key: string }[];
  rejected: { id: string; reason: string }[];
} {
  const ready: { id: string; key: string }[] = [];
  const rejected: { id: string; reason: string }[] = [];
  return {
    ready,
    rejected,
    async find() {
      return row;
    },
    async markReady(id, key) {
      ready.push({ id, key });
    },
    async markRejected(id, reason) {
      rejected.push({ id, reason });
    },
  };
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
}

const row: UploadScanStoreRow = {
  id: "up1",
  ownerId: "u1",
  objectKey: "uploads/pending/up1",
  status: "PENDING_SCAN",
};

describe("upload.scan processor", () => {
  it("scans, re-encodes to the fixed output, uploads the derivative, deletes the raw object, and marks READY", async () => {
    const png = await tinyPng();
    const storage = createFakeStoragePort();
    await storage.put(row.objectKey, png, "image/png");
    const store = fakeStore(row);

    await createUploadScanProcessor({
      store,
      storage,
      scanner: passthroughScanner,
    })({ v: 1, uploadId: "up1" }, context());

    expect(store.ready).toEqual([{ id: "up1", key: avatarKey("u1", "up1") }]);
    const derivative = await storage.get(avatarKey("u1", "up1"));
    const meta = await sharp(derivative).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    await expect(storage.get(row.objectKey)).rejects.toBeInstanceOf(
      StorageError
    );
  });

  it("marks REJECTED, without throwing, when the bytes are not a decodable image", async () => {
    const storage = createFakeStoragePort();
    await storage.put(
      row.objectKey,
      Buffer.from("this is not an image"),
      "image/png"
    );
    const store = fakeStore(row);

    await createUploadScanProcessor({
      store,
      storage,
      scanner: passthroughScanner,
    })({ v: 1, uploadId: "up1" }, context());

    expect(store.rejected).toHaveLength(1);
    expect(store.ready).toEqual([]);
  });

  it("marks REJECTED when the bytes decode but claim a disallowed format (a renamed file)", async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "blue" },
    })
      .gif()
      .toBuffer();
    const storage = createFakeStoragePort();
    await storage.put(row.objectKey, gif, "image/png");
    const store = fakeStore(row);

    await createUploadScanProcessor({
      store,
      storage,
      scanner: passthroughScanner,
    })({ v: 1, uploadId: "up1" }, context());

    expect(store.rejected).toHaveLength(1);
  });

  it("marks REJECTED when the scanner rejects the content", async () => {
    const png = await tinyPng();
    const storage = createFakeStoragePort();
    await storage.put(row.objectKey, png, "image/png");
    const store = fakeStore(row);
    const scanner: ScannerPort = {
      async scan() {
        return { ok: false, reason: "flagged" };
      },
    };

    await createUploadScanProcessor({ store, storage, scanner })(
      { v: 1, uploadId: "up1" },
      context()
    );

    expect(store.rejected).toEqual([{ id: "up1", reason: "flagged" }]);
  });

  it("propagates a scanner outage so the job retries; the row stays PENDING_SCAN (fails closed)", async () => {
    const storage = createFakeStoragePort();
    await storage.put(row.objectKey, await tinyPng(), "image/png");
    const store = fakeStore(row);
    const scanner: ScannerPort = {
      async scan() {
        throw new Error("clamd unreachable: ECONNREFUSED");
      },
    };
    await expect(
      createUploadScanProcessor({ store, storage, scanner })(
        { v: 1, uploadId: "up1" },
        context()
      )
    ).rejects.toThrow(/clamd/);
    expect(store.ready).toEqual([]);
    expect(store.rejected).toEqual([]);
    expect(await storage.get(row.objectKey)).toBeDefined();
  });

  it("is a no-op (idempotent) when the row is already READY or REJECTED", async () => {
    const storage = createFakeStoragePort();
    for (const status of ["READY", "REJECTED"] as const) {
      const store = fakeStore({ ...row, status });
      await createUploadScanProcessor({
        store,
        storage,
        scanner: passthroughScanner,
      })({ v: 1, uploadId: "up1" }, context());
      expect(store.ready).toEqual([]);
      expect(store.rejected).toEqual([]);
    }
  });

  it("is a no-op when the row is missing (deleted, or a stale retry)", async () => {
    const storage = createFakeStoragePort();
    const store = fakeStore(null);
    await createUploadScanProcessor({
      store,
      storage,
      scanner: passthroughScanner,
    })({ v: 1, uploadId: "missing" }, context());
    expect(store.ready).toEqual([]);
  });

  it("propagates a storage outage so the job retries, and touches no row", async () => {
    const store = fakeStore(row);
    const storage: StoragePort = {
      ...createFakeStoragePort(),
      get: vi.fn(async () => {
        throw new StorageError("down", "unavailable");
      }),
    };
    await expect(
      createUploadScanProcessor({
        store,
        storage,
        scanner: passthroughScanner,
      })({ v: 1, uploadId: "up1" }, context())
    ).rejects.toBeInstanceOf(StorageError);
    expect(store.ready).toEqual([]);
    expect(store.rejected).toEqual([]);
  });
});

// File-upload attacks. The declared type is checked at presign
// and pinned in the storage policy; these prove what the worker does with bytes that lie about themselves.
describe("upload.scan against hostile files", () => {
  async function scanBytes(bytes: Buffer) {
    const storage = createFakeStoragePort();
    await storage.put(row.objectKey, bytes, "image/png");
    const store = fakeStore(row);
    await createUploadScanProcessor({
      store,
      storage,
      scanner: passthroughScanner,
    })({ v: 1, uploadId: "up1" }, context());
    const derivative =
      store.ready.length > 0 ? await storage.get(avatarKey("u1", "up1")) : null;
    return { store, derivative };
  }

  it.each([
    [
      "an SVG carrying a script",
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>alert(1)</script><rect width="8" height="8"/></svg>',
    ],
    ["an HTML page", "<!doctype html><script>alert(1)</script>"],
    ["a PDF header", "%PDF-1.7\n1 0 obj<<>>endobj"],
  ])(
    "rejects %s declared as image/png (type spoofing)",
    async (_name, text) => {
      const { store } = await scanBytes(Buffer.from(text));
      expect(store.rejected).toHaveLength(1);
      expect(store.ready).toEqual([]);
    }
  );

  it("a valid image with HTML and a ZIP appended (a polyglot) comes out re-encoded, trailer gone", async () => {
    const trailer = Buffer.concat([
      Buffer.from("<script>alert(document.cookie)</script>"),
      Buffer.from("PK\x03\x04payload.txt"),
    ]);
    const { store, derivative } = await scanBytes(
      Buffer.concat([await tinyPng(), trailer])
    );
    expect(store.ready).toHaveLength(1);
    expect(derivative!.includes("<script")).toBe(false);
    expect(derivative!.includes("PK\x03\x04")).toBe(false);
    expect((await sharp(derivative!).metadata()).format).toBe("webp");
  });

  it("strips EXIF, GPS included, from the derivative", async () => {
    const withGps = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "blue" },
    })
      .jpeg()
      .withExif({
        IFD0: { Make: "PhoneCo", Model: "Leaky 1" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "27/1 5/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "93/1 36/1 0/1",
        },
      })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const { derivative } = await scanBytes(withGps);
    const meta = await sharp(derivative!).metadata();
    expect(meta.exif).toBeUndefined();
    expect(derivative!.includes("Leaky")).toBe(false);
  });

  it("refuses a decompression bomb by its declared dimensions, before decoding it", async () => {
    // A tiny file that claims to be 20 000 px wide.
    const bomb = await sharp({
      create: { width: 20_000, height: 1, channels: 3, background: "black" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(50_000);
    const { store } = await scanBytes(bomb);
    expect(store.rejected).toHaveLength(1);
  });
});
