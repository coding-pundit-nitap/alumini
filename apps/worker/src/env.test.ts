import { describe, expect, it } from "vitest";

import { loadCliEnv, loadEnv } from "./env.ts";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  QUEUE_REDIS_URL: "redis://localhost:6380",
  APP_URL: "http://localhost:3000",
  SMTP_URL: "smtp://user:secret@localhost:1025",
  EMAIL_FROM: "NITAP <no-reply@alumni.test>",
};

describe("loadEnv", () => {
  it("applies defaults and coerces numbers", () => {
    const env = loadEnv({ ...valid, WORKER_HEALTH_PORT: "3010" });
    expect(env.EMAIL_RATE_PER_SECOND).toBe(5);
    expect(env.WORKER_HEALTH_PORT).toBe(3010);
    expect(env.NODE_ENV).toBe("development");
    expect(loadEnv(valid).REDIS_URL).toBeUndefined();
    expect(
      loadEnv({ ...valid, REDIS_URL: "redis://localhost:6379" }).REDIS_URL
    ).toBe("redis://localhost:6379");
  });

  it("names every missing or invalid variable, and never echoes a value", () => {
    const error = (() => {
      try {
        loadEnv({
          QUEUE_REDIS_URL: "",
          SMTP_URL: "smtp://user:secret@host",
          EMAIL_RATE_PER_SECOND: "0",
        });
      } catch (e) {
        return e as Error;
      }
      throw new Error("expected loadEnv to throw");
    })();
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("QUEUE_REDIS_URL");
    expect(error.message).toContain("EMAIL_FROM");
    expect(error.message).toContain("EMAIL_RATE_PER_SECOND");
    expect(error.message).not.toContain("secret");
  });

  it("rejects a monitoring token shorter than 16 characters", () => {
    expect(() => loadEnv({ ...valid, HEALTH_CHECK_TOKEN: "short" })).toThrow(
      /HEALTH_CHECK_TOKEN/
    );
    expect(
      loadEnv({ ...valid, HEALTH_CHECK_TOKEN: "a".repeat(16) })
        .HEALTH_CHECK_TOKEN
    ).toBe("a".repeat(16));
  });

  it("the CLI needs only the database and the queue Redis", () => {
    expect(
      loadCliEnv({
        DATABASE_URL: valid.DATABASE_URL,
        QUEUE_REDIS_URL: valid.QUEUE_REDIS_URL,
      }).QUEUE_REDIS_URL
    ).toBe(valid.QUEUE_REDIS_URL);
    expect(() => loadCliEnv({})).toThrow(/DATABASE_URL/);
  });
});
