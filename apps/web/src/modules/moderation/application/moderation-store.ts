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
/** Moderator actions leave audit rows in the same transaction (FR-MOD-004, spec A12-9). Ids only. */
export type ModerationAuditEntry =
  | {
      action: "report.claimed" | "report.resolved" | "report.dismissed";
      actorId: string;
      reportId: string;
      targetType: "POST" | "COMMENT";
      targetId: string;
    }
  | {
      action: "post.removed" | "comment.removed";
      actorId: string;
      reportId: string;
      contentId: string;
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
  audit(entry: ModerationAuditEntry): Promise<void>;
};
export type ModerationStore = {
  transaction<T>(work: (tx: ModerationTx) => Promise<T>): Promise<T>;
};
