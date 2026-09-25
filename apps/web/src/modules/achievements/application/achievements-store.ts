export type AchievementRow = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  status:
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "PUBLISHED"
    | "REJECTED"
    | "WITHDRAWN";
  reviewedById: string | null;
  publishedPostId: string | null;
  createdAt: Date;
};
/** Reviewer-queue row: the owner (submitter) identity, joined from the `AchievementOwner` relation. */
export type PendingAchievementRow = AchievementRow & {
  owner: { id: string; name: string };
};
/** Review decisions leave an audit row in the same transaction (FR-MOD-004, spec A12-9). Ids only. */
export type AchievementAuditEntry = {
  action: "achievement.approved" | "achievement.rejected";
  actorId: string;
  achievementId: string;
  ownerId: string;
};
export type AchievementsTx = {
  insertAchievement(input: {
    userId: string;
    title: string;
    description: string;
    category: string;
  }): Promise<AchievementRow>;
  findAchievement(id: string): Promise<AchievementRow | null>;
  /** Whole-row-patch: writes status (and reviewedById/publishedPostId when the caller sets them). */
  patchAchievement(
    id: string,
    patch: { status: string; reviewedById?: string; publishedPostId?: string }
  ): Promise<void>;
  /**
   * The C-12 write: creates the ACHIEVEMENT-type Post and links it via published_post_id, in the SAME
   * transaction as the status patch. This is modules/achievements writing a Post row directly by SQL —
   * not an import of modules/posts — the same cross-module-write-by-SQL shape as moderation's soft-delete.
   */
  publishAsPost(
    achievementId: string,
    input: { authorId: string; title: string; description: string }
  ): Promise<{ postId: string }>;
  listOwn(
    userId: string,
    args: { limit: number; after: { createdAt: Date; id: string } | null }
  ): Promise<AchievementRow[]>;
  /** Reviewer queue read: every SUBMITTED achievement, any user. */
  listPending(args: {
    limit: number;
    after: { createdAt: Date; id: string } | null;
  }): Promise<PendingAchievementRow[]>;
  enqueue(event: {
    type:
      "achievement.submitted" | "achievement.approved" | "achievement.rejected";
    payload: unknown;
  }): Promise<void>;
  audit(entry: AchievementAuditEntry): Promise<void>;
};
export type AchievementsStore = {
  transaction<T>(work: (tx: AchievementsTx) => Promise<T>): Promise<T>;
};
