import { describe, expect, it } from "vitest";

import { loadStorageEnv } from "./env.ts";

const valid = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "alumini-uploads",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: "true",
};

describe("loadStorageEnv", () => {
  it("parses a complete environment", () => {
    expect(loadStorageEnv(valid)).toEqual({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      bucket: "alumini-uploads",
      accessKeyId: "key",
      secretAccessKey: "secret",
      forcePathStyle: true,
    });
  });

  it("defaults forcePathStyle to false when absent", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.S3_FORCE_PATH_STYLE;
    expect(loadStorageEnv(rest).forcePathStyle).toBe(false);
  });

  it("accepts /storage and rejects a URL or any other path", () => {
    expect(
      loadStorageEnv({ ...valid, S3_PUBLIC_PATH: "/storage" }).publicPath
    ).toBe("/storage");
    expect(() =>
      loadStorageEnv({ ...valid, S3_PUBLIC_PATH: "http://x/storage" })
    ).toThrow("S3_PUBLIC_PATH");
    expect(() =>
      loadStorageEnv({ ...valid, S3_PUBLIC_PATH: "/files" })
    ).toThrow("S3_PUBLIC_PATH");
  });

  it("names the missing variables without leaking any value", () => {
    const error = (() => {
      try {
        loadStorageEnv({});
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toContain("S3_ENDPOINT");
    expect(error?.message).toContain("S3_BUCKET");
    expect(error?.message).not.toContain("secret");
  });
});
