"use client";

import { Button } from "@nitap/ui/components/button";
import { Card, CardContent, CardFooter } from "@nitap/ui/components/card";
import Link from "next/link";

import type { ActionResult } from "@/lib/action-result";
import {
  ReportDecisionDialog,
  ReportDialog,
  type ModerationTarget,
} from "@/modules/moderation";

import type { FeedPost } from "../../application/posts-store";
import type { ReactionType } from "../../domain/posts";
import { MarkdownView } from "./markdown-view";
import { ReactionPicker } from "./reaction-picker";

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

/**
 * A single feed post: Markdown-rendered content (never raw, C-2), images, reactions, a comment-count
 * link, own-post delete, and — for an actor holding `post.moderate`/`report.review` (`canModerate`) — an
 * inline Report affordance that flips to Resolve/Dismiss once `post.openReportId` is set (`list-feed`
 * joins the `report` table, so this is a durable per-post read, not session-local state: any moderator
 * viewing the feed sees the same affordance, and it clears once the report is resolved/dismissed).
 */
export function PostCard({
  post,
  currentUserId,
  canModerate,
  mine,
  onDelete,
  onReact,
  onUnreact,
  onReport,
  onResolve,
  onDismiss,
}: {
  post: FeedPost;
  currentUserId: string | null;
  canModerate: boolean;
  mine: ReactionType | null;
  onDelete: DeleteAction;
  onReact: ReactAction;
  onUnreact: UnreactAction;
  onReport: ReportAction;
  onResolve: ResolveAction;
  onDismiss: ResolveAction;
}) {
  const reportId = post.openReportId ?? null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <MarkdownView content={post.content} />

        {post.imageUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {post.imageUrls.map((id) => (
              // ponytail: assumes a future /api/uploads/[id] file-serving route; not built in this task
              // (out of scope — only UI files were in Task 13's file list).
              // eslint-disable-next-line @next/next/no-img-element -- served by a signed route, not a static asset
              <img
                key={id}
                src={`/api/uploads/${id}`}
                alt="Post attachment"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        ) : null}

        {post.linkUrl ? (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary block text-sm underline"
          >
            {post.linkUrl}
          </a>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        <ReactionPicker
          postId={post.id}
          mine={mine}
          onReact={onReact}
          onUnreact={onUnreact}
        />
        <Link
          href={`/feed/${post.id}`}
          className="text-muted-foreground text-sm underline"
        >
          Comments
        </Link>

        {currentUserId === post.authorId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(post.id)}
          >
            Delete
          </Button>
        ) : null}

        {canModerate ? (
          reportId ? (
            <div className="flex gap-1.5">
              <ReportDecisionDialog
                outcome="resolve"
                reportId={reportId}
                action={onResolve}
              />
              <ReportDecisionDialog
                outcome="dismiss"
                reportId={reportId}
                action={onDismiss}
              />
            </div>
          ) : (
            <ReportDialog
              targetType="POST"
              targetId={post.id}
              onSubmit={onReport}
            />
          )
        ) : null}
      </CardFooter>
    </Card>
  );
}
