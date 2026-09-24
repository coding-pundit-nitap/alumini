import { describe, it, expect } from "vitest";
import { canSeeHealthDetails } from "./monitoring-access.ts";

const request = (authorization?: string) =>
  new Request("http://localhost/health/ready", {
    headers: authorization ? { authorization } : {},
  });

describe("canSeeHealthDetails (reliability §4.1: minimal on the public path)", () => {
  it("hides details from anonymous callers in production", () => {
    expect(
      canSeeHealthDetails(request(), {
        nodeEnv: "production",
        token: "monitor-secret-1",
      })
    ).toBe(false);
  });

  it("shows details to a request carrying the monitoring token", () => {
    expect(
      canSeeHealthDetails(request("Bearer monitor-secret-1"), {
        nodeEnv: "production",
        token: "monitor-secret-1",
      })
    ).toBe(true);
  });

  it("rejects a wrong token, and any token when none is configured", () => {
    expect(
      canSeeHealthDetails(request("Bearer nope"), {
        nodeEnv: "production",
        token: "monitor-secret-1",
      })
    ).toBe(false);
    expect(
      canSeeHealthDetails(request("Bearer undefined"), {
        nodeEnv: "production",
      })
    ).toBe(false);
    expect(
      canSeeHealthDetails(request("Bearer "), {
        nodeEnv: "production",
        token: "",
      })
    ).toBe(false);
  });

  it("shows details outside production for development and tests", () => {
    expect(canSeeHealthDetails(request(), { nodeEnv: "development" })).toBe(
      true
    );
    expect(canSeeHealthDetails(request(), { nodeEnv: "test" })).toBe(true);
  });
});
