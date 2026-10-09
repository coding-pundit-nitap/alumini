import { describe, expect, it } from "vitest";

import { AuthenticationError, AuthorizationError } from "@/lib/errors";

import type { Actor, Grant } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import { createAuthorization, type AuthzEvent } from "./authorize";

const NOW = new Date("2026-09-21T00:00:00.000Z");

const verified = (grants: Grant[] = []): Actor => ({
  userId: "user-1",
  accountState: "VERIFIED",
  requestId: "req-1",
  grants,
});
const holds = (
  permission: Grant["permission"],
  expiresAt: Date | null = null
) => verified([{ permission, scope: "GLOBAL", expiresAt }]);

function setup() {
  const events: AuthzEvent[] = [];
  const { authorize, can } = createAuthorization({
    observer: { record: (event) => events.push(event) },
    now: () => NOW,
  });
  return { authorize, can, events };
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("authorize", () => {
  it("answers 401 for no actor and records it", () => {
    const { authorize, events } = setup();
    const error = thrown(() => authorize(null, PERMISSIONS.PROFILE_READ));
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(events).toEqual([
      { outcome: "unauthenticated", permission: PERMISSIONS.PROFILE_READ },
    ]);
  });

  it("returns the actor when allowed and records it", () => {
    const { authorize, events } = setup();
    const actor = holds(PERMISSIONS.PROFILE_READ);
    expect(authorize(actor, PERMISSIONS.PROFILE_READ)).toBe(actor);
    expect(events).toEqual([
      {
        outcome: "allowed",
        permission: PERMISSIONS.PROFILE_READ,
        userId: "user-1",
        requestId: "req-1",
      },
    ]);
  });

  it("answers 403 when denied, and keeps the reason out of the error", () => {
    const { authorize, events } = setup();
    const error = thrown(() =>
      authorize(verified(), PERMISSIONS.EVENT_CREATE)
    ) as AuthorizationError;
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.message).not.toContain("NO_GRANT");
    expect(events).toEqual([
      {
        outcome: "denied",
        permission: PERMISSIONS.EVENT_CREATE,
        userId: "user-1",
        requestId: "req-1",
        reason: "NO_GRANT",
      },
    ]);
  });

  it("answers 404 when denied on a concealed resource", () => {
    const { authorize } = setup();
    const error = thrown(() =>
      authorize(verified(), PERMISSIONS.PROFILE_READ_ANY, { concealed: true })
    ) as AuthorizationError;
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("uses the injected clock for grant expiry", () => {
    const { authorize } = setup();
    const expired = holds(
      PERMISSIONS.EVENT_CREATE,
      new Date(NOW.getTime() - 1)
    );
    expect(
      thrown(() => authorize(expired, PERMISSIONS.EVENT_CREATE))
    ).toBeInstanceOf(AuthorizationError);
  });

  it("records the guardrail reason for a self-decision", () => {
    const { authorize, events } = setup();
    const actor = holds(PERMISSIONS.ALUMNI_VERIFY);
    thrown(() =>
      authorize(actor, PERMISSIONS.ALUMNI_VERIFY, { subjectUserId: "user-1" })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ outcome: "denied", reason: "SELF_DECISION" })
    );
  });
});

describe("can", () => {
  it("answers a boolean and records nothing", () => {
    const { can, events } = setup();
    expect(can(holds(PERMISSIONS.EVENT_CREATE), PERMISSIONS.EVENT_CREATE)).toBe(
      true
    );
    expect(can(verified(), PERMISSIONS.EVENT_CREATE)).toBe(false);
    expect(can(null, PERMISSIONS.EVENT_CREATE)).toBe(false);
    expect(events).toEqual([]);
  });
});
