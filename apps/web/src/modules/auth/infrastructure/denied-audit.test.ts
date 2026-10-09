import { describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@nitap/database/audit";

import { createDeniedAudit } from "./denied-audit";

const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const SUBJECT = "00000000-0000-4000-8000-0000000000bb";
const denied = (permission: string, subjectUserId?: string) =>
  ({
    outcome: "denied",
    permission,
    userId: ACTOR,
    requestId: "r",
    reason: "NO_GRANT",
    subjectUserId,
  }) as const;

describe("createDeniedAudit", () => {
  it("writes an authz.denied row for an admin-tier denial, targeting the subject", async () => {
    const write = vi.fn(async () => {});
    const record = createDeniedAudit({
      write,
      onDropped: vi.fn(),
      onFailed: vi.fn(),
    });
    record(denied("user.suspend", SUBJECT) as never);
    await Promise.resolve();
    expect(write).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: "authz.denied",
      targetType: "user",
      targetId: SUBJECT,
      metadata: { permission: "user.suspend", reason: "NO_GRANT" },
    });
  });

  it("targets the actor when there is no subject", () => {
    const write = vi.fn<(entry: AuditEntry) => Promise<void>>(async () => {});
    createDeniedAudit({ write, onDropped: vi.fn(), onFailed: vi.fn() })(
      denied("audit.read") as never
    );
    expect(write.mock.calls[0]?.[0]).toMatchObject({ targetId: ACTOR });
  });

  it("ignores a non-admin-tier denial", () => {
    const write = vi.fn(async () => {});
    createDeniedAudit({ write, onDropped: vi.fn(), onFailed: vi.fn() })(
      denied("post.create") as never
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("drops above the in-flight cap and counts it", () => {
    const write = vi.fn(() => new Promise<void>(() => {})); // never settles
    const onDropped = vi.fn();
    const record = createDeniedAudit({
      write,
      onDropped,
      onFailed: vi.fn(),
      maxInFlight: 2,
    });
    for (let i = 0; i < 3; i += 1) record(denied("audit.read") as never);
    expect(write).toHaveBeenCalledTimes(2);
    expect(onDropped).toHaveBeenCalledTimes(1);
  });

  it("reports a failed write and never throws", async () => {
    const onFailed = vi.fn();
    const record = createDeniedAudit({
      write: async () => {
        throw new Error("db down");
      },
      onDropped: vi.fn(),
      onFailed,
    });
    expect(() => record(denied("audit.read") as never)).not.toThrow();
    await vi.waitFor(() => expect(onFailed).toHaveBeenCalled());
  });
});
