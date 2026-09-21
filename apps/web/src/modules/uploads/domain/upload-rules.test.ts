import { describe, expect, it } from "vitest";

import {
  ALLOWED_MIME,
  assertUploadable,
  IMAGE_OUTPUT,
  MAX_OPEN_UPLOADS,
  MAX_UPLOAD_BYTES,
  UploadNotAllowedError,
} from "./upload-rules";

const codeOf = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof UploadNotAllowedError) return error.code;
  }
  throw new Error("expected assertUploadable to throw UploadNotAllowedError");
};

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

  it("rejects a disallowed type, coded UPLOAD_TYPE_NOT_ALLOWED", () => {
    expect(
      codeOf(() => assertUploadable({ ...valid, mime: "application/pdf" }))
    ).toBe("UPLOAD_TYPE_NOT_ALLOWED");
  });

  it("rejects a size of zero or below, coded UPLOAD_INVALID_SIZE", () => {
    expect(codeOf(() => assertUploadable({ ...valid, size: 0 }))).toBe(
      "UPLOAD_INVALID_SIZE"
    );
    expect(codeOf(() => assertUploadable({ ...valid, size: -1 }))).toBe(
      "UPLOAD_INVALID_SIZE"
    );
  });

  it("rejects a size over the cap (coded UPLOAD_TOO_LARGE), and accepts exactly the cap", () => {
    expect(
      codeOf(() => assertUploadable({ ...valid, size: MAX_UPLOAD_BYTES + 1 }))
    ).toBe("UPLOAD_TOO_LARGE");
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
