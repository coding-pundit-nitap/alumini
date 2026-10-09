import type { Tick } from "@/lib/role-tick";
import type { ReactionType } from "../domain/posts";

export type PostRow = {
  id: string;
  authorId: string;
  chapterId: string | null;
  content: string;
  title: string | null;
  imageUrls: string[];
  linkUrl: string | null;
  postType: "TEXT" | "ACHIEVEMENT" | "ANNOUNCEMENT";
  deleted: boolean;
  createdAt: Date;
  editedAt: Date | null;
};
export type PostAuthor = {
  id: string;
  fullName: string;
  headline: string | null;
  hasPhoto: boolean;
  /** Set by composition after the read; absent/null = no tick. */
  tick?: Tick | null;
};
/**
 * The enriched read model `listFeed`/`findFeedPost` return: a post plus its author, per-type
 * reaction counts (every `ReactionType` present, 0 when none), the live (non-deleted) comment
 * count, the viewer's own reaction, and the id of an OPEN/UNDER_REVIEW report against it (or null).
 * Backs the feed's Resolve/Dismiss affordance (`canModerate` actors only render it); not moderation-
 * module state duplication — modules/posts reads the `report` table directly, the same
 * cross-module-read-by-schema pattern `blockedBetween`/`uploadsReady` already use.
 */
export type FeedPost = PostRow & {
  author: PostAuthor;
  reactionCounts: Record<ReactionType, number>;
  commentCount: number;
  myReaction: ReactionType | null;
  openReportId: string | null;
};
export type CommentRow = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  deleted: boolean;
  createdAt: Date;
  author: PostAuthor;
};
export type PostsTx = {
  blockedBetween(x: string, y: string): Promise<boolean>;
  uploadsReady(ids: string[], ownerId: string): Promise<boolean>;
  insertPost(input: {
    authorId: string;
    chapterId: string | null;
    content: string;
    title: string | null;
    imageUrls: string[];
    linkUrl: string | null;
    postType: "TEXT" | "ACHIEVEMENT" | "ANNOUNCEMENT";
  }): Promise<PostRow>;
  findPost(id: string, opts?: { forUpdate?: boolean }): Promise<PostRow | null>;
  /** Null when missing or soft-deleted (deleted posts never resolve). */
  findFeedPost(id: string, viewerId: string): Promise<FeedPost | null>;
  /** Serves only a READY upload that a live post's `imageUrls` references; see get-post-image-key.ts. */
  findPostImage(uploadId: string): Promise<{ objectKey: string } | null>;
  softDeletePost(id: string): Promise<void>;
  /** Replaces the content and stamps `editedAt`. */
  updatePostContent(id: string, content: string): Promise<void>;
  /** Is a report against this post still OPEN or UNDER_REVIEW? */
  openReportExists(postId: string): Promise<boolean>;
  listFeed(args: {
    limit: number;
    after: { createdAt: Date; id: string } | null;
    viewerId: string;
  }): Promise<FeedPost[]>;
  insertComment(input: {
    postId: string;
    authorId: string;
    body: string;
  }): Promise<CommentRow>;
  findComment(id: string): Promise<CommentRow | null>;
  softDeleteComment(id: string): Promise<void>;
  listComments(args: {
    postId: string;
    limit: number;
    after: { createdAt: Date; id: string } | null;
  }): Promise<CommentRow[]>;
  upsertReaction(input: {
    postId: string;
    userId: string;
    type: string;
  }): Promise<{ id: string }>;
  deleteReaction(postId: string, userId: string): Promise<void>;
  enqueue(event: {
    type:
      | "post.created"
      | "comment.created"
      | "reaction.added"
      | "announcement.published";
    payload: unknown;
  }): Promise<void>;
  /** Announcement writes leave an audit row in the same transaction. Ids only. */
  audit(entry: {
    action: "announcement.published" | "announcement.removed";
    actorId: string;
    postId: string;
  }): Promise<void>;
  /** Live announcements, newest first, keyset after `after`. */
  listAnnouncements(args: {
    limit: number;
    after: { createdAt: Date; id: string } | null;
  }): Promise<(PostRow & { author: PostAuthor })[]>;
  /** The newest live announcement created at or after `since`, enriched for the viewer; null when none. */
  findPinnedAnnouncement(args: {
    since: Date;
    viewerId: string;
  }): Promise<FeedPost | null>;
};
export type PostsStore = {
  transaction<T>(work: (tx: PostsTx) => Promise<T>): Promise<T>;
};
