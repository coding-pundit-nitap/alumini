import { describe, expect, it } from "vitest";

import type { Actor } from "@/modules/auth";

import type {
  ModerationStore,
  ModerationTx,
  ReportRow,
} from "./moderation-store";
import { createResolveReport } from "./resolve-report";

const MOD = "00000000-0000-4000-8000-0000000000aa";
const REPORTER = "00000000-0000-4000-8000-0000000000bb";
const OWNER = "00000000-0000-4000-8000-0000000000cc";
const TARGET = "00000000-0000-4000-8000-0000000000dd";
const actor: Actor = {
  userId: MOD,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
};

function fakeStore(targetType: ReportRow["targetType"]) {
  const calls: string[] = [];
  const report: ReportRow = {
    id: "00000000-0000-4000-8000-000000000001",
    reporterId: REPORTER,
    targetType,
    targetId: TARGET,
    reason: "x",
    status: "OPEN",
    resolvedById: null,
    createdAt: new Date(),
  };
  const tx = {
    findReport: async () => report,
    contentAuthor: async () => OWNER,
    patchReport: async (_id: string, p: { status: string }) =>
      void calls.push(`patch:${p.status}`),
    softDeleteContent: async (t: string) => void calls.push(`softDelete:${t}`),
    hideMessage: async () => (calls.push("hide"), true),
    audit: async (e: { action: string }) =>
      void calls.push(`audit:${e.action}`),
    enqueue: async (e: { type: string }) =>
      void calls.push(`enqueue:${e.type}`),
  } as unknown as ModerationTx;
  const store: ModerationStore = {
    transaction: (work) => work(tx),
  } as ModerationStore;
  return { store, calls };
}

// Task 4 adds the reason; until then the call takes none.
const run = (targetType: ReportRow["targetType"]) => {
  const { store, calls } = fakeStore(targetType);
  return createResolveReport({ store, authorize: (a) => a! })({
    actor,
    reportId: "00000000-0000-4000-8000-000000000001",
  } as never).then(() => calls);
};

describe("resolveReport per target type (spec C12-2)", () => {
  it("POST: soft-deletes, audits post.removed, enqueues content.removed", async () => {
    expect(await run("POST")).toEqual([
      "patch:RESOLVED",
      "audit:report.resolved",
      "softDelete:POST",
      "audit:post.removed",
      "enqueue:content.removed",
      "enqueue:report.resolved",
    ]);
  });
  it("COMMENT: soft-deletes, audits comment.removed", async () => {
    expect(await run("COMMENT")).toContain("audit:comment.removed");
  });
  it("MESSAGE: hides, audits message.hidden, never content.removed (spec C-5)", async () => {
    expect(await run("MESSAGE")).toEqual([
      "patch:RESOLVED",
      "audit:report.resolved",
      "hide",
      "audit:message.hidden",
      "enqueue:report.resolved",
    ]);
  });
  it("USER: no side effect beyond the report", async () => {
    expect(await run("USER")).toEqual([
      "patch:RESOLVED",
      "audit:report.resolved",
      "enqueue:report.resolved",
    ]);
  });
});
