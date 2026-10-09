import { describe, expect, it, vi } from "vitest";

import {
  assertProductionConfig,
  exitIfMisconfigured,
} from "./production-config";

// A production instance missing its auth secret started, reported healthy, and answered every
// sign-in with a 500. It must refuse to start instead, so a broken release never passes its health checks.

const complete = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db:5432/alumini",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://alumni.example.edu",
  REDIS_URL: "redis://cache:6379",
  S3_ENDPOINT: "https://s3.example.edu",
  S3_REGION: "ap-south-1",
  S3_BUCKET: "uploads",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("assertProductionConfig", () => {
  it("accepts a complete production configuration", () => {
    expect(() => assertProductionConfig(complete)).not.toThrow();
  });

  it("checks nothing outside production", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "development" })
    ).not.toThrow();
  });

  it.each([
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "REDIS_URL",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_SECRET_ACCESS_KEY",
  ])("refuses to start without %s, naming it", (name) => {
    expect(() =>
      assertProductionConfig({ ...complete, [name]: undefined })
    ).toThrow(name);
  });

  it("refuses a short auth secret, and never prints a value", () => {
    const error = (() => {
      try {
        assertProductionConfig({
          ...complete,
          BETTER_AUTH_SECRET: "short-secret",
        });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toContain("BETTER_AUTH_SECRET");
    expect(error?.message).not.toContain("short-secret");
  });

  it("requires HTTPS for the public URL except on localhost", () => {
    expect(() =>
      assertProductionConfig({
        ...complete,
        BETTER_AUTH_URL: "http://alumni.example.edu",
      })
    ).toThrow(/BETTER_AUTH_URL/);
    for (const local of ["http://localhost:3000", "http://127.0.0.1:3100"]) {
      expect(() =>
        assertProductionConfig({ ...complete, BETTER_AUTH_URL: local })
      ).not.toThrow();
    }
  });
});

describe("exitIfMisconfigured", () => {
  it("exits the process with 1 and a fatal line naming the problem", () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    exitIfMisconfigured({ ...complete, BETTER_AUTH_SECRET: undefined });
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(log.mock.calls[0]?.[0])).toContain(
      "BETTER_AUTH_SECRET is not set"
    );
  });

  it("does nothing when the configuration is complete", () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    exitIfMisconfigured(complete);
    expect(exit).not.toHaveBeenCalled();
  });
});
