import { afterAll, describe, expect, it } from "vitest";

import { loadStorageEnv } from "./env.ts";
import { pendingKey } from "./key.ts";
import { StorageError } from "./port.ts";
import { createS3StoragePort } from "./s3.ts";

// Straight to MinIO: S3_PUBLIC_PATH (set in a local .env) makes presigned URLs relative to the web app's
// origin, which only resolves behind the running Next.js rewrite, so this suite leaves it out.
const env = { ...loadStorageEnv(process.env), publicPath: undefined };
const storage = createS3StoragePort(env);
const written: string[] = [];

afterAll(async () => {
  await Promise.allSettled(written.map((key) => storage.delete(key)));
});

function trackedKey(): string {
  const key = pendingKey(
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  written.push(key);
  return key;
}

describe("S3 storage adapter against real MinIO", () => {
  it("put/get/head/delete round-trip", async () => {
    const key = trackedKey();
    await storage.put(key, Buffer.from("hello minio"), "text/plain");

    const head = await storage.head(key);
    expect(head).toEqual({ size: 11, contentType: "text/plain" });

    const body = await storage.get(key);
    expect(body.toString()).toBe("hello minio");

    await storage.delete(key);
    await expect(storage.head(key)).rejects.toBeInstanceOf(StorageError);
  });

  it("head and get reject with a not_found StorageError for a missing key", async () => {
    const key = pendingKey("does-not-exist");
    await expect(storage.head(key)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(storage.get(key)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("presignDownload returns a URL that fetches the object's bytes", async () => {
    const key = trackedKey();
    await storage.put(key, Buffer.from("downloadable"), "text/plain");

    const url = await storage.presignDownload({ key, expiresInSeconds: 60 });
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("downloadable");
  });

  it("presignUpload lets a browser POST a file within the size cap, straight to the store", async () => {
    const key = trackedKey();
    const { url, fields } = await storage.presignUpload({
      key,
      contentType: "text/plain",
      maxBytes: 1024,
    });

    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    form.set("file", new Blob(["small enough"], { type: "text/plain" }));

    const response = await fetch(url, { method: "POST", body: form });
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    expect((await storage.head(key)).size).toBe(12);
  });

  it("presignUpload's content-length-range rejects a file over the cap", async () => {
    const key = trackedKey();
    const { url, fields } = await storage.presignUpload({
      key,
      contentType: "text/plain",
      maxBytes: 5,
    });

    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    form.set(
      "file",
      new Blob(["this is definitely over five bytes"], { type: "text/plain" })
    );

    const response = await fetch(url, { method: "POST", body: form });
    expect(response.status).toBeGreaterThanOrEqual(400);
    await expect(storage.head(key)).rejects.toBeInstanceOf(StorageError);
  });

  // Storage isolation. The web app proxies /storage/* to the store on its own
  // origin, so an object readable without a signature would be content served from this origin.
  it("an object cannot be read, listed or overwritten without a signature", async () => {
    const key = trackedKey();
    await storage.put(
      key,
      Buffer.from("<script>alert(1)</script>"),
      "text/html"
    );
    const base = `${env.endpoint.replace(/\/$/, "")}/${env.bucket}`;

    expect((await fetch(`${base}/${key}`)).status).toBe(403);
    expect((await fetch(`${base}?list-type=2`)).status).toBe(403);
    expect(
      (await fetch(`${base}/${key}`, { method: "PUT", body: "replaced" }))
        .status
    ).toBe(403);
    expect((await storage.get(key)).toString()).toBe(
      "<script>alert(1)</script>"
    );
  });

  it("a presigned URL stops working once it has been tampered with", async () => {
    const key = trackedKey();
    await storage.put(key, Buffer.from("secret"), "text/plain");
    const url = new URL(
      await storage.presignDownload({ key, expiresInSeconds: 60 })
    );
    const other = trackedKey();
    await storage.put(other, Buffer.from("other"), "text/plain");
    url.pathname = url.pathname.replace(key, other);
    expect((await fetch(url)).status).toBe(403);
  });
});
