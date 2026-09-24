"use client";

import {
  ArrowUpRight,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nitap/ui/components/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";

import type { ActionResult } from "@/lib/action-result";
import {
  ReportDecisionDialog,
  ReportDialog,
  type ModerationTarget,
} from "@/modules/moderation";

import type { FeedPost } from "../../application/posts-store";
import type { ReactionType } from "../../domain/posts";
import { MarkdownView } from "./markdown-view";
import { PostAuthorLine } from "./post-author";
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

const IMAGE_GRID: Record<"1" | "2" | "many", string> = {
  "1": "aspect-video",
  "2": "grid-cols-2 aspect-square",
  many: "grid-cols-2",
};

function gridClass(count: number) {
  if (count === 1) return IMAGE_GRID["1"];
  if (count === 2) return IMAGE_GRID["2"];
  return IMAGE_GRID.many;
}

function LinkPreview({ url }: { url: string }) {
  let host = url;
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    path = parsed.pathname === "/" ? "" : parsed.pathname;
  } catch {
    // Fall back to showing the raw string.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <Link2 className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-medium">{host}</span>
        {path ? <span className="text-muted-foreground">{path}</span> : null}
      </span>
      <ArrowUpRight className="text-muted-foreground ml-auto size-4 shrink-0" />
    </a>
  );
}

function ImageGrid({
  imageUrls,
  authorName,
}: {
  imageUrls: string[];
  authorName: string;
}) {
  const [broken, setBroken] = useState<Set<string>>(new Set());

  return (
    <div
      className={`mt-3 grid gap-1 overflow-hidden rounded-lg ${gridClass(imageUrls.length)}`}
    >
      {imageUrls.map((id, i) =>
        broken.has(id) ? (
          <div
            key={id}
            className="bg-muted text-muted-foreground flex aspect-[4/3] items-center justify-center text-sm"
          >
            Image unavailable
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- served by a signed route, not a static asset
          <img
            key={id}
            src={`/api/uploads/${id}`}
            alt={`Image ${i + 1} of ${imageUrls.length} from ${authorName}`}
            className={`w-full object-cover ${
              imageUrls.length === 1 ? "aspect-video" : "aspect-[4/3]"
            }`}
            onError={() => setBroken((prev) => new Set(prev).add(id))}
          />
        )
      )}
    </div>
  );
}

function PostBody({
  content,
  expanded,
}: {
  content: string;
  expanded: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(expanded);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || forceExpanded) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [content, forceExpanded]);

  return (
    <div>
      <div ref={ref} className={forceExpanded ? undefined : "line-clamp-6"}>
        <MarkdownView content={content} />
      </div>
      {clamped && !forceExpanded ? (
        <button
          type="button"
          onClick={() => setForceExpanded(true)}
          className="text-brand mt-1 text-sm hover:underline"
        >
          …more
        </button>
      ) : null}
    </div>
  );
}

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
  expanded = false,
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
  expanded?: boolean;
  onDelete: DeleteAction;
  onReact: ReactAction;
  onUnreact: UnreactAction;
  onReport: ReportAction;
  onResolve: ResolveAction;
  onDismiss: ResolveAction;
}) {
  const [deleted, setDeleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const isOwn = currentUserId === post.authorId;
  const reportId = post.openReportId ?? null;
  const showReport = canModerate && !reportId;
  const hasMenu = isOwn;

  if (deleted) return null;

  async function handleDelete() {
    const result = await onDelete(post.id);
    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }
    setDeleteError(null);
    setConfirmDelete(false);
    setDeleted(true);
  }

  async function handleShare() {
    const url = `${window.location.origin}/feed/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    }
    setTimeout(() => setShareStatus("idle"), 2000);
  }

  const badge: ReactNode =
    post.postType === "ACHIEVEMENT" ? (
      <span className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full px-2 text-xs">
        <Trophy className="size-3" />
        Achievement
      </span>
    ) : undefined;

  return (
    <article className="border-border bg-card hover:border-foreground/15 rounded-xl border p-4 transition-colors sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <PostAuthorLine
          author={post.author}
          createdAt={post.createdAt}
          currentUserId={currentUserId}
          badge={badge}
        />
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Post options"
              render={
                <button
                  type="button"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg"
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setConfirmDelete(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="mt-3">
        <PostBody content={post.content} expanded={expanded} />
      </div>

      {post.imageUrls.length > 0 ? (
        <ImageGrid
          imageUrls={post.imageUrls}
          authorName={post.author.fullName}
        />
      ) : null}

      {post.linkUrl ? <LinkPreview url={post.linkUrl} /> : null}

      <div className="border-border mt-3 flex items-center gap-1 border-t pt-2">
        <ReactionPicker
          postId={post.id}
          counts={post.reactionCounts}
          mine={post.myReaction}
          onReact={onReact}
          onUnreact={onUnreact}
        />
        <Link
          href={`/feed/${post.id}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem]"
        >
          <MessageCircle className="size-3.5" />
          {post.commentCount === 0
            ? "Comment"
            : post.commentCount === 1
              ? "1 comment"
              : `${post.commentCount} comments`}
        </Link>
        <button
          type="button"
          aria-label="Copy link to post"
          onClick={handleShare}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem]"
        >
          <Share2 className="size-3.5" />
        </button>
        {shareStatus !== "idle" ? (
          <span role="status" className="text-muted-foreground text-xs">
            {shareStatus === "copied" ? "Link copied" : "Couldn't copy"}
          </span>
        ) : null}

        {showReport || (canModerate && reportId) ? (
          <div className="ml-auto flex gap-1.5">
            {reportId ? (
              <>
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
              </>
            ) : (
              <ReportDialog
                targetType="POST"
                targetId={post.id}
                onSubmit={onReport}
              />
            )}
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from the feed for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-destructive text-sm">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
