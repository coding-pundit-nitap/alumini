import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@nitap/database/permissions";

import { AuthorizationError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { encodeAuditCursor } from "../domain/audit-query";
import type { AdminStore, AuditRow } from "./admin-store";
import { createListAuditLog } from "./list-audit-log";

const actor: Actor = {
  userId: "u1",
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const allow = (a: Actor | null) => a as Actor;
const row = (i: number): AuditRow => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, 10 - i)),
  action: "job.approved",
  targetType: "job",
  targetId: "00000000-0000-4000-8000-000000000099",
  metadata: {},
  requestId: null,
  actor: { id: "u1", name: "A", email: "a@x.test" },
});

function storeReturning(rows: AuditRow[]): AdminStore {
  return { countTile: vi.fn(), listAuditLog: vi.fn(async () => rows) };
}

describe("listAuditLog", () => {
  it("authorizes audit.read as a concealed resource (404, not 403)", async () => {
    const authorize = vi.fn(() => {
      throw new AuthorizationError({ hideExistence: true });
    });
    const s = storeReturning([]);
    const list = createListAuditLog({ store: s, authorize });
    await expect(list({ actor, query: {} })).rejects.toMatchObject({
      status: 404,
    });
    expect(authorize).toHaveBeenCalledWith(actor, PERMISSIONS.AUDIT_READ, {
      concealed: true,
    });
    expect(s.listAuditLog).not.toHaveBeenCalled();
  });

  it("asks for limit+1 and returns a cursor only when there is more", async () => {
    const s = storeReturning([row(1), row(2), row(3)]);
    const list = createListAuditLog({ store: s, authorize: allow });
    const page = await list({ actor, query: { limit: "2" } });
    expect(s.listAuditLog).toHaveBeenCalledWith({
      filter: {},
      after: null,
      take: 3,
    });
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBe(
      encodeAuditCursor({ createdAt: row(2).createdAt, id: row(2).id })
    );
  });

  it("passes the filters and decoded cursor to the store", async () => {
    const s = storeReturning([]);
    const list = createListAuditLog({ store: s, authorize: allow });
    const after = { createdAt: row(1).createdAt, id: row(1).id };
    await list({
      actor,
      query: { action: "job.approved", cursor: encodeAuditCursor(after) },
    });
    expect(s.listAuditLog).toHaveBeenCalledWith({
      filter: { action: "job.approved" },
      after,
      take: 51,
    });
  });

  it("returns no cursor on the last page", async () => {
    const list = createListAuditLog({
      store: storeReturning([row(1)]),
      authorize: allow,
    });
    expect((await list({ actor, query: {} })).nextCursor).toBeNull();
  });

  it("rejects a bad filter with VALIDATION_FAILED and a bad cursor with INVALID_CURSOR", async () => {
    const list = createListAuditLog({
      store: storeReturning([]),
      authorize: allow,
    });
    await expect(
      list({ actor, query: { actorId: "x" } })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      list({ actor, query: { cursor: "garbage" } })
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});
