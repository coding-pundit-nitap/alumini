import type {
  DismissReason,
  ModerationTarget,
  ReportState,
  ReportTargetType,
  ResolveReason,
} from "../domain/moderation";

export type ReportRow = {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportState;
  resolvedById: string | null;
  createdAt: Date;
};
/** Moderator actions leave audit rows in the same transaction (FR-MOD-004, spec A12-9). Ids and codes only. */
export type ModerationAuditEntry =
  | {
      action: "report.claimed" | "report.resolved" | "report.dismissed";
      actorId: string;
      reportId: string;
      targetType: ReportTargetType;
      targetId: string;
      reason?: ResolveReason | DismissReason;
    }
  | {
      action: "post.removed" | "comment.removed" | "message.hidden";
      actorId: string;
      reportId: string;
      contentId: string;
    };
export type ModerationTx = {
  /** Cross-module read: who owns the target (author, sender, or the user itself), for the self-review guard. */
  contentAuthor(
    targetType: ReportTargetType,
    targetId: string
  ): Promise<string | null>;
  insertReport(input: {
    reporterId: string;
    targetType: ModerationTarget;
    targetId: string;
    reason: string;
  }): Promise<{ id: string; created: boolean }>;
  /** Locks the report row (FOR UPDATE): concurrent decisions on one report are serialised. */
  findReport(id: string): Promise<ReportRow | null>;
  patchReport(
    id: string,
    patch: { status: ReportState; resolvedById?: string }
  ): Promise<void>;
  /** Cross-module write: soft-deletes the reported post/comment by SQL (no import of modules/posts). */
  softDeleteContent(
    targetType: ModerationTarget,
    targetId: string
  ): Promise<void>;
  /** Cross-module write: sets message.hidden_at once. True only when this call hid it. */
  hideMessage(messageId: string): Promise<boolean>;
  enqueue(event: {
    type: "report.filed" | "report.resolved" | "content.removed";
    payload: unknown;
  }): Promise<void>;
  audit(entry: ModerationAuditEntry): Promise<void>;
};
export type ModerationStore = {
  transaction<T>(work: (tx: ModerationTx) => Promise<T>): Promise<T>;
};
