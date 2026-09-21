import { describe, expect, it } from "vitest";

import {
  ALLOWED_MIME,
  assertUploadable,
  IMAGE_OUTPUT,
  MAX_OPEN_UPLOADS,
  MAX_UPLOAD_BYTES,
} from "./upload-rules";

describe("assertUploadable", () => {
  const valid = {
    purpose: "PROFILE_PHOTO" as const,
    mime: "image/png",
    size: 1000,
  };

  it("accepts a valid photo upload", () => {
    expect(() => assertUploadable(valid)).not.toThrow();
  });

  it.each(ALLOWED_MIME)("accepts %s", (mime) => {
    expect(() => assertUploadable({ ...valid, mime })).not.toThrow();
  });

  it("rejects a disallowed type", () => {
    expect(() =>
      assertUploadable({ ...valid, mime: "application/pdf" })
    ).toThrow(/type/i);
  });

  it("rejects a size of zero or below", () => {
    expect(() => assertUploadable({ ...valid, size: 0 })).toThrow(/size/i);
    expect(() => assertUploadable({ ...valid, size: -1 })).toThrow(/size/i);
  });

  it("rejects a size over the cap, and accepts exactly the cap", () => {
    expect(() =>
      assertUploadable({ ...valid, size: MAX_UPLOAD_BYTES + 1 })
    ).toThrow(/too large/i);
    expect(() =>
      assertUploadable({ ...valid, size: MAX_UPLOAD_BYTES })
    ).not.toThrow();
  });
});

describe("constants", () => {
  it("MAX_UPLOAD_BYTES is 5MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
  it("MAX_OPEN_UPLOADS is 5", () => {
    expect(MAX_OPEN_UPLOADS).toBe(5);
  });
  it("IMAGE_OUTPUT is a fixed 512px webp", () => {
    expect(IMAGE_OUTPUT).toEqual({ size: 512, format: "webp" });
  });
});
