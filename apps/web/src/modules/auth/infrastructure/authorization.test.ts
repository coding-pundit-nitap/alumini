import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";
import {
  logger,
  setMetrics,
  type Metrics,
} from "@/infrastructure/observability";
import { noopMetrics } from "@nitap/observability";

import type { Actor } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import { authorize, can } from "./authorization";

const recordingMetrics = () => {
  const increment = vi.fn<Metrics["increment"]>();
  setMetrics({ increment, observe: vi.fn(), gauge: vi.fn() });
  return increment;
};

afterEach(() => setMetrics(noopMetrics));

const verified = (grants: Actor["grants"] = []): Actor => ({
  userId: "user-1",
  accountState: "VERIFIED",
  requestId: "req-1",
  grants,
});

describe("the wired authorize()", () => {
  it("logs authz.denied and counts a denial", () => {
    const increment = recordingMetrics();
    const warn = vi.spyOn(logger, "warn");

    expect(() => authorize(verified(), PERMISSIONS.EVENT_CREATE)).toThrow(
      AuthorizationError
    );

    expect(increment).toHaveBeenCalledWith("authz_decisions_total", {
      permission: "event.create",
      outcome: "denied",
    });
    expect(warn).toHaveBeenCalledWith("authz.denied", {
      metadata: {
        permission: "event.create",
        reason: "NO_GRANT",
        actorId: "user-1",
        requestId: "req-1",
      },
    });
  });

  it("counts an allowed decision without logging a denial", () => {
    const increment = recordingMetrics();
    const warn = vi.spyOn(logger, "warn");
    const actor = verified([
      {
        permission: PERMISSIONS.EVENT_CREATE,
        scope: "GLOBAL",
        expiresAt: null,
      },
    ]);

    expect(authorize(actor, PERMISSIONS.EVENT_CREATE)).toBe(actor);

    expect(increment).toHaveBeenCalledWith("authz_decisions_total", {
      permission: "event.create",
      outcome: "allowed",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("counts an unauthenticated call", () => {
    const increment = recordingMetrics();
    expect(() => authorize(null, PERMISSIONS.PROFILE_READ)).toThrow(
      AuthenticationError
    );
    expect(increment).toHaveBeenCalledWith("authz_decisions_total", {
      permission: "profile.read",
      outcome: "unauthenticated",
    });
  });

  it("can() answers without counting", () => {
    const increment = recordingMetrics();
    expect(can(verified(), PERMISSIONS.EVENT_CREATE)).toBe(false);
    expect(increment).not.toHaveBeenCalled();
  });
});
