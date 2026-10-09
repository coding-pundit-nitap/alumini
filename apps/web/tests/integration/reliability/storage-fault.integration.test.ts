// Object storage down and slow: the production S3 adapter reaches MinIO through a fault proxy, driven
// by the photo-upload Server Actions.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const setup = await vi.hoisted(async () => {
  const { startFaultProxy, testDatabaseName, upstreamOf } =
    await import("@nitap/testing");
  const endpoint = process.env.S3_ENDPOINT!;
  const proxy = await startFaultProxy({ upstream: upstreamOf(endpoint) });
  process.env.S3_ENDPOINT = proxy.url(endpoint).replace(/\/$/, "");
  // Presigned URLs point straight at the store here; the app-origin rewrite needs a running Next.js.
  delete process.env.S3_PUBLIC_PATH;
  const name = testDatabaseName();
  const database = new URL(process.env.DATABASE_URL!);
  database.pathname = `/${name}`;
  process.env.DATABASE_URL = database.toString();
  return { proxy, name };
});

const mocks = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/modules/auth/infrastructure/actor", () => ({
  getActor: mocks.getActor,
}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ auth: {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  withFault,
  type TestDatabase,
} from "@nitap/testing";

import {
  completePhotoUploadAction,
  presignPhotoUploadAction,
} from "@/app/(app)/profile/photo-actions";
import { pool } from "@/infrastructure/database/client";
import type { Actor } from "@/modules/auth";
import { resolveActor } from "@/modules/auth/application/resolve-actor";
import { createPrismaGrantSource } from "@/modules/auth/infrastructure/prisma-grant-source";

// The smallest valid PNG (1×1).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("object storage unavailable (real S3 adapter through a fault proxy)", () => {
  let db: TestDatabase;
  let actor: Actor;

  beforeAll(async () => {
    db = await createTestDatabase({ name: setup.name });
    await runSeed(db.prisma);
    const user = await db.prisma.user.create({
      data: { name: "M", email: "m@example.test", accountState: "VERIFIED" },
    });
    const student = await db.prisma.role.findUniqueOrThrow({
      where: { name: "STUDENT" },
    });
    await db.prisma.userRole.create({
      data: { userId: user.id, roleId: student.id, grantedBy: user.id },
    });
    actor = await resolveActor(
      {
        grantSource: createPrismaGrantSource(db.prisma),
        now: () => new Date(),
      },
      { userId: user.id, accountState: "VERIFIED" },
      "req-storage-fault"
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
    await setup.proxy.close();
    await db.drop();
  });

  beforeEach(() => {
    mocks.getActor.mockResolvedValue(actor);
  });

  /** presign, then the browser's direct POST of the bytes to the store. */
  async function uploaded(): Promise<string> {
    const presigned = await presignPhotoUploadAction({
      mime: "image/png",
      size: PNG.length,
    });
    if (!presigned.ok) throw new Error(JSON.stringify(presigned.error));
    const form = new FormData();
    for (const [k, v] of Object.entries(presigned.data.fields))
      form.append(k, v);
    form.append("file", new Blob([PNG], { type: "image/png" }));
    const post = await fetch(presigned.data.url, {
      method: "POST",
      body: form,
    });
    expect(post.ok).toBe(true);
    return presigned.data.uploadId;
  }

  async function status(uploadId: string) {
    return (
      await db.prisma.upload.findUniqueOrThrow({ where: { id: uploadId } })
    ).status;
  }

  it("down: completing an upload answers SERVICE_UNAVAILABLE and writes nothing; it completes after recovery", async () => {
    const uploadId = await uploaded();

    await withFault(setup.proxy, "down", async () => {
      const result = await completePhotoUploadAction(uploadId);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE" },
      });
      // Nothing half-written: the row did not move and no scan job was queued.
      expect(await status(uploadId)).toBe("PENDING_UPLOAD");
      expect(
        await db.prisma.outboxEvent.count({ where: { type: "upload.scan" } })
      ).toBe(0);
    });

    const retried = await completePhotoUploadAction(uploadId);
    expect(retried).toEqual({ ok: true, data: { status: "PENDING_SCAN" } });
    expect(await status(uploadId)).toBe("PENDING_SCAN");
  }, 30_000);

  it("stalled: completing answers SERVICE_UNAVAILABLE within the adapter's time bound instead of hanging", async () => {
    const uploadId = await uploaded();

    await withFault(setup.proxy, "stall", async () => {
      const started = Date.now();
      const result = await completePhotoUploadAction(uploadId);
      const elapsed = Date.now() - started;
      expect(result).toMatchObject({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE" },
      });
      expect(elapsed).toBeLessThan(8_000);
      expect(await status(uploadId)).toBe("PENDING_UPLOAD");
    });
  }, 40_000);
});
