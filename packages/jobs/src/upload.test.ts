import { describe, expect, it } from "vitest";

import { uploadScan, uploadScanPayload, uploadSweep } from "./upload.ts";

describe("upload.scan", () => {
  it("accepts a valid payload", () => {
    expect(
      uploadScanPayload.safeParse({
        v: 1,
        uploadId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
  });

  it("rejects a non-uuid uploadId and any unknown field", () => {
    expect(
      uploadScanPayload.safeParse({ v: 1, uploadId: "not-a-uuid" }).success
    ).toBe(false);
    expect(
      uploadScanPayload.safeParse({
        v: 1,
        uploadId: "11111111-1111-4111-8111-111111111111",
        extra: "x",
      }).success
    ).toBe(false);
  });

  it("is named upload.scan, version 1", () => {
    expect(uploadScan.name).toBe("upload.scan");
    expect(uploadScan.version).toBe(1);
  });
});

describe("upload.sweep", () => {
  it("is a scheduled job with no payload beyond the version", () => {
    expect(uploadSweep.queue).toBe("scheduled");
    expect(uploadSweep.schema.safeParse({ v: 1 }).success).toBe(true);
    expect(uploadSweep.schema.safeParse({ v: 1, extra: "x" }).success).toBe(
      false
    );
  });
});
