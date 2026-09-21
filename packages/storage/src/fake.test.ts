import { describe, expect, it } from "vitest";

import { createFakeStoragePort } from "./fake.ts";
import { StorageError } from "./port.ts";

describe("createFakeStoragePort", () => {
  it("round-trips put/get/delete", async () => {
    const storage = createFakeStoragePort();
    await storage.put("uploads/pending/a", Buffer.from("hi"), "text/plain");
    expect((await storage.get("uploads/pending/a")).toString()).toBe("hi");
    await storage.delete("uploads/pending/a");
    await expect(storage.get("uploads/pending/a")).rejects.toThrow(
      StorageError
    );
  });

  it("head reports the stored size and type, and not_found otherwise", async () => {
    const storage = createFakeStoragePort();
    await storage.put("k", Buffer.from("abcd"), "image/png");
    expect(await storage.head("k")).toEqual({
      size: 4,
      contentType: "image/png",
    });
    await expect(storage.head("missing")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("presignUpload and presignDownload return usable descriptors without touching the network", async () => {
    const storage = createFakeStoragePort();
    const upload = await storage.presignUpload({
      key: "uploads/pending/a",
      contentType: "image/png",
      maxBytes: 1024,
    });
    expect(upload.url).toBeTruthy();
    expect(upload.fields).toBeTruthy();
    const download = await storage.presignDownload({
      key: "uploads/pending/a",
      expiresInSeconds: 60,
    });
    expect(download).toContain("uploads/pending/a");
  });

  it("can be made to fail like the real adapter, for unavailable-storage tests", async () => {
    const storage = createFakeStoragePort({ failWith: "unavailable" });
    await expect(storage.get("k")).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});
