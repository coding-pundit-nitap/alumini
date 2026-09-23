import { describe, expect, it } from "vitest";

import {
  auditQuerySchema,
  decodeAuditCursor,
  encodeAuditCursor,
} from "./audit-query";

const uuid = "0b9c6f1e-3a55-4a8e-9a39-6a0f5b8f2c11";

describe("auditQuerySchema", () => {
  it("defaults limit to 50 and treats empty strings as absent (GET form fields)", () => {
    expect(auditQuerySchema.parse({ action: "", actorId: "" })).toEqual({
      limit: 50,
    });
  });

  it("rejects a limit above 100 rather than clamping it", () => {
    expect(auditQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(auditQuerySchema.parse({ limit: "100" }).limit).toBe(100);
  });

  it("accepts a well-formed filter set", () => {
    const q = auditQuerySchema.parse({
      actorId: uuid,
      action: "job.approved",
      targetType: "job",
      targetId: uuid,
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-02T00:00:00Z",
    });
    expect(q.from).toEqual(new Date("2026-09-01T00:00:00Z"));
    expect(q.action).toBe("job.approved");
  });

  it.each([
    [{ actorId: "nope" }],
    [{ action: "Job Approved" }],
    [{ targetType: "x".repeat(51) }],
    [{ from: "not a date" }],
    [{ from: "2026-09-02T00:00:00Z", to: "2026-09-02T00:00:00Z" }],
    [{ unknown: "1" }],
  ])("rejects %j", (input) => {
    expect(auditQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("audit cursor", () => {
  it("round-trips", () => {
    const c = { createdAt: new Date("2026-09-01T10:00:00.123Z"), id: uuid };
    expect(decodeAuditCursor(encodeAuditCursor(c))).toEqual(c);
  });

  it.each(["", "!!!", btoa("{}"), btoa('{"c":"x","i":"y"}')])(
    "rejects %s",
    (raw) => expect(decodeAuditCursor(raw)).toBeNull()
  );
});
