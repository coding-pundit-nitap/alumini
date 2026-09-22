export type ReportRow = {
  id: string;
  reporterId: string;
  targetType: "POST" | "COMMENT";
  targetId: string;
  reason: string;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
  resolvedById: string | null;
  createdAt: Date;
};
export type ModerationTx = {
  /** Cross-module read: resolves a POST/COMMENT target's author id without importing modules/posts. */
  contentAuthor(
    targetType: "POST" | "COMMENT",
    targetId: string
  ): Promise<string | null>;
  insertReport(input: {
    reporterId: string;
    targetType: "POST" | "COMMENT";
    targetId: string;
    reason: string;
  }): Promise<{ id: string; created: boolean }>;
  findReport(id: string): Promise<ReportRow | null>;
  patchReport(
    id: string,
    patch: { status: string; resolvedById?: string }
  ): Promise<void>;
  /** Cross-module write: soft-deletes the reported row directly by SQL (no import of modules/posts). */
  softDeleteContent(
    targetType: "POST" | "COMMENT",
    targetId: string
  ): Promise<void>;
  enqueue(event: {
    type: "report.filed" | "report.resolved" | "content.removed";
    payload: unknown;
  }): Promise<void>;
};
export type ModerationStore = {
  transaction<T>(work: (tx: ModerationTx) => Promise<T>): Promise<T>;
};
