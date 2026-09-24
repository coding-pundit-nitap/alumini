import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/modules/auth";

import { encodeKeysetCursor } from "../domain/keyset-cursor";
import { createGetReport } from "./get-report";
import { createListReports } from "./list-reports";
import type { ModerationStore, ReportView } from "./moderation-store";

const ME = "00000000-0000-4000-8000-0000000000aa";
const actor: Actor = {
  userId: ME,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};
const view = (n: number, over: Partial<ReportView> = {}): ReportView => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  status: "OPEN",
  targetType: "POST",
  targetId: "00000000-0000-4000-8000-0000000000dd",
  reason: "spam",
  createdAt: new Date(Date.UTC(2026, 8, 24, 10, n)),
  reporter: { id: "00000000-0000-4000-8000-0000000000bb", name: "Ravi" },
  resolvedBy: null,
  targetOwnerId: "00000000-0000-4000-8000-0000000000cc",
  preview: { text: "hello", deleted: false },
  ...over,
});

function storeReturning(rows: ReportView[]) {
  const listReports = vi.fn(async () => rows);
  const store = {
    transaction: (work) => work({ listReports } as never),
  } as ModerationStore;
  return { store, listReports };
}
const authorize = vi.fn((a: Actor | null) => a!);

describe("listReports (spec C12-5)", () => {
  it("authorizes concealed before parsing, and passes the open statuses by default", async () => {
    const { store, listReports } = storeReturning([]);
    await createListReports({ store, authorize })({ actor, query: {} });
    expect(authorize).toHaveBeenCalledWith(actor, "report.review", {
      concealed: true,
    });
    expect(listReports).toHaveBeenCalledWith({
      statuses: ["OPEN", "UNDER_REVIEW"],
      targetType: undefined,
      after: null,
      take: 51,
    });
  });

  it("pages with limit + 1 and a cursor on the last kept row", async () => {
    const rows = [view(3), view(2), view(1)];
    const { store } = storeReturning(rows);
    const page = await createListReports({ store, authorize })({
      actor,
      query: { limit: "2" },
    });
    expect(page.data).toHaveLength(2);
    expect(page.nextCursor).toBe(
      encodeKeysetCursor({ createdAt: rows[1]!.createdAt, id: rows[1]!.id })
    );
  });

  it("rejects a bad filter on its field and a foreign cursor as INVALID_CURSOR", async () => {
    const { store } = storeReturning([]);
    const list = createListReports({ store, authorize });
    await expect(
      list({ actor, query: { targetType: "EVENT" } })
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [expect.objectContaining({ field: "targetType" })],
    });
    await expect(
      list({ actor, query: { cursor: "nope" } })
    ).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });
});

describe("getReport (spec C12-7)", () => {
  it("flags self-review for the reporter and for the target's owner", async () => {
    for (const over of [
      { reporter: { id: ME, name: "Me" } },
      { targetOwnerId: ME },
    ]) {
      const { store } = storeReturning([view(1, over)]);
      const { selfReview } = await createGetReport({ store, authorize })({
        actor,
        reportId: view(1).id,
      });
      expect(selfReview).toBe(true);
    }
    const { store } = storeReturning([view(1)]);
    expect(
      (
        await createGetReport({ store, authorize })({
          actor,
          reportId: view(1).id,
        })
      ).selfReview
    ).toBe(false);
  });

  it("answers NOT_FOUND for an unknown report", async () => {
    const { store } = storeReturning([]);
    await expect(
      createGetReport({ store, authorize })({ actor, reportId: view(1).id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
