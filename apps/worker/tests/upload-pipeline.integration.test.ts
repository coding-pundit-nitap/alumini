import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUploadStore } from "@nitap/database/uploads";
import { createOutboxWriter } from "@nitap/database/outbox";
import { defineJob, uploadScan } from "@nitap/jobs";
import {
  avatarKey,
  createS3StoragePort,
  loadStorageEnv,
  pendingKey,
} from "@nitap/storage";
import {
  createRedisNamespace,
  createTestDatabase,
  type RedisNamespace,
  type TestDatabase,
} from "@nitap/testing";

import { composeWorker } from "../src/compose.ts";
import type { ComposedWorker } from "../src/compose.ts";
import { recordingMetrics, silentLogger } from "./support.ts";

const fastUploadScan = defineJob({
  ...uploadScan,
  retry: { attempts: 3, baseDelayMs: 40, maxDelayMs: 120, jitter: 0 },
});

const eventually = (assertion: () => unknown | Promise<unknown>) =>
  vi.waitFor(assertion, { timeout: 10_000, interval: 50 });

describe("outbox → relay → queue → worker → scan (real PostgreSQL, Redis and MinIO)", () => {
  let db: TestDatabase;
  let ns: RedisNamespace;
  let worker: ComposedWorker | undefined;
  const uploads = createUploadStore();
  const writer = createOutboxWriter({ requestId: () => "req-upload-pipeline" });
  const storage = createS3StoragePort(loadStorageEnv(process.env));

  beforeEach(async () => {
    db = await createTestDatabase();
    ns = await createRedisNamespace();
  });

  afterEach(async () => {
    if (worker) await worker.stop();
    worker = undefined;
    await ns.cleanup();
    await db.drop();
  });

  it("scans a real uploaded image end to end: derivative lands in MinIO, the row reaches READY", async () => {
    const user = await db.prisma.user.create({
      data: { name: "Asha", email: "asha@upload-pipeline.test" },
    });
    const upload = await uploads.create(db.prisma, {
      ownerId: user.id,
      purpose: "PROFILE_PHOTO",
      objectKey: pendingKey(crypto.randomUUID()),
      mime: "image/png",
      size: 100,
    });
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    await storage.put(upload.objectKey, png, "image/png");
    // Real size, so the eventual `complete` step's mismatch check (exercised elsewhere) would pass too.
    await db.prisma.upload.update({
      where: { id: upload.id },
      data: { size: png.byteLength, status: "PENDING_SCAN" },
    });

    const metrics = recordingMetrics();
    worker = composeWorker(
      {
        prisma: db.prisma,
        logger: silentLogger(),
        metrics,
        storage,
        config: {
          queueRedisUrl: ns.url,
          queuePrefix: ns.prefix,
          smtpUrl: "smtp://localhost:1",
          emailFrom: "NITAP <no-reply@alumni.test>",
          appUrl: "https://alumni.example",
          emailRatePerSecond: 50,
        },
      },
      { uploadScanJob: fastUploadScan, relay: { pollIntervalMs: 40 } }
    );
    await worker.start();

    await db.prisma.$transaction((tx) =>
      writer.add(tx, {
        type: "upload.scan",
        payload: { v: 1, uploadId: upload.id },
      })
    );

    await eventually(async () => {
      const row = await db.prisma.upload.findUniqueOrThrow({
        where: { id: upload.id },
      });
      expect(row.status).toBe("READY");
      expect(row.objectKey).toBe(avatarKey(user.id, upload.id));
    });

    const row = await db.prisma.upload.findUniqueOrThrow({
      where: { id: upload.id },
    });
    const derivative = await storage.get(row.objectKey);
    const meta = await sharp(derivative).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);

    // The raw object is gone; only the derivative remains.
    await expect(storage.head(upload.objectKey)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
