import Link from "next/link";

import type { ActionResult } from "@/lib/action-result";
import type { ModerationTarget } from "@/modules/moderation";

import type { FeedPost } from "../../application/posts-store";
import type { ReactionType } from "../../domain/posts";
import { PostCard } from "./post-card";

type DeleteAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;
type ReactAction = (
  postId: string,
  input: { type: ReactionType }
) => Promise<ActionResult<Record<string, never>>>;
type UnreactAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;
type ReportAction = (input: {
  targetType: ModerationTarget;
  targetId: string;
  reason: string;
}) => Promise<ActionResult<{ reportId: string; created: boolean }>>;
type ResolveAction = (
  reportId: string,
  reason: string
) => Promise<ActionResult<Record<string, never>>>;

/** The feed, as returned by `listFeed` (newest-first, C-6); a Link carries the next keyset cursor. */
export function FeedList({
  posts,
  nextCursor,
  currentUserId,
  canModerate,
  onDelete,
  onReact,
  onUnreact,
  onReport,
  onResolve,
  onDismiss,
}: {
  posts: FeedPost[];
  nextCursor: string | null;
  currentUserId: string | null;
  canModerate: boolean;
  onDelete: DeleteAction;
  onReact: ReactAction;
  onUnreact: UnreactAction;
  onReport: ReportAction;
  onResolve: ResolveAction;
  onDismiss: ResolveAction;
}) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          canModerate={canModerate}
          onDelete={onDelete}
          onReact={onReact}
          onUnreact={onUnreact}
          onReport={onReport}
          onResolve={onResolve}
          onDismiss={onDismiss}
        />
      ))}
      {nextCursor ? (
        <Link
          href={`/feed?cursor=${encodeURIComponent(nextCursor)}`}
          className="text-primary block text-center text-sm underline"
        >
          Load more
        </Link>
      ) : null}
    </div>
  );
}
