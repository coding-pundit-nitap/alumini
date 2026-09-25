"use client";

import {
  ArrowUpRight,
  Check,
  ImageOff,
  Link2,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Share,
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
import { cn } from "@/lib/utils";
import {
  ReportDecisionDialog,
  ReportDialog,
  type ModerationTarget,
} from "@/modules/moderation";

import type { FeedPost } from "../../application/posts-store";
import type { ReactionType } from "../../domain/posts";
import { COMMENT_FORM_ID } from "./comment-thread";
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
  "1": "",
  "2": "grid-cols-2 aspect-square",
  many: "grid-cols-2",
};

const ACTION =
  "text-muted-foreground focus-visible:ring-ring flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2";

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
      className="border-border hover:bg-muted/60 group/link mt-3 flex items-center gap-3 rounded-xl border p-2 pr-3 text-sm transition-colors duration-150"
    >
      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Link2 className="text-muted-foreground size-4" />
      </span>
      <span className="min-w-0 truncate">
        <span className="font-medium">{host}</span>
        {path ? <span className="text-muted-foreground">{path}</span> : null}
      </span>
      <ArrowUpRight className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform duration-200 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
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
      className={`border-border mt-3 grid gap-0.5 overflow-hidden rounded-xl border ${gridClass(imageUrls.length)}`}
    >
      {imageUrls.map((id, i) =>
        broken.has(id) ? (
          <div
            key={id}
            className="bg-muted/60 text-muted-foreground flex min-h-24 items-center justify-center gap-2 text-xs"
          >
            <ImageOff aria-hidden className="size-4" />
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

/** Past these, six lines are almost surely overflowed at any column width. */
const LIKELY_CLAMP_CHARS = 480;
const LIKELY_CLAMP_LINES = 6;

function PostBody({
  content,
  expanded,
}: {
  content: string;
  expanded: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The server can't measure, so it guesses from the text: an obviously long post ships its "…more" in the
  // first paint instead of popping it in after hydration and pushing the feed down. Measured on mount.
  const [clamped, setClamped] = useState(
    () =>
      !expanded &&
      (content.length > LIKELY_CLAMP_CHARS ||
        content.split("\n").length > LIKELY_CLAMP_LINES)
  );
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
          className="text-muted-foreground hover:text-foreground mt-1 text-sm font-medium"
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
  const hasMenu = isOwn && post.postType !== "ANNOUNCEMENT";

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

  const bodySize = expanded ? "text-[17px]" : "text-[15px]";

  const badge: ReactNode =
    post.postType === "ACHIEVEMENT" ? (
      <span className="bg-chart-2/15 text-chart-2 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
        <Trophy className="size-3" />
        Achievement
      </span>
    ) : post.postType === "ANNOUNCEMENT" ? (
      <span className="bg-brand/10 text-brand inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
        <Megaphone className="size-3" />
        Announcement
      </span>
    ) : undefined;

  return (
    <article
      className={cn(
        "px-4 sm:px-5",
        expanded
          ? "pt-5"
          : "hover:bg-muted/25 pt-4 pb-2 transition-colors duration-200"
      )}
    >
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
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
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

      {/* Everything below the author line aligns with the name: 40px avatar + 12px gap. */}
      {/* In the feed the body aligns with the name (40px avatar + 12px gap); on its own page it runs full width. */}
      <div className={expanded ? undefined : "sm:pl-[52px]"}>
        {post.postType === "ACHIEVEMENT" ? (
          // Achievements read as a certificate: trophy medallion, first line as the title.
          <div className="border-chart-2/25 from-chart-2/10 mt-3 flex gap-3.5 rounded-xl border bg-gradient-to-br to-transparent to-60% p-4">
            <span className="bg-chart-2/15 text-chart-2 ring-chart-2/25 flex size-10 shrink-0 items-center justify-center rounded-full ring-1">
              <Trophy aria-hidden className="size-5" />
            </span>
            <div
              className={`text-muted-foreground first-line:text-foreground min-w-0 pt-1.5 leading-relaxed first-line:font-semibold ${bodySize}`}
            >
              <PostBody content={post.content} expanded={expanded} />
            </div>
          </div>
        ) : post.postType === "ANNOUNCEMENT" ? (
          <div className="border-brand/20 from-brand/5 mt-3 rounded-xl border bg-gradient-to-br to-transparent to-60% p-4">
            <h3 className="text-foreground text-[17px] leading-snug font-semibold text-balance">
              {post.title}
            </h3>
            <div
              className={`text-muted-foreground mt-1.5 leading-relaxed ${bodySize}`}
            >
              <PostBody content={post.content} expanded={expanded} />
            </div>
          </div>
        ) : (
          <div className={`mt-2 leading-relaxed ${bodySize}`}>
            <PostBody content={post.content} expanded={expanded} />
          </div>
        )}

        {post.imageUrls.length > 0 ? (
          <ImageGrid
            imageUrls={post.imageUrls}
            authorName={post.author.fullName}
          />
        ) : null}

        {post.linkUrl ? <LinkPreview url={post.linkUrl} /> : null}

        {expanded ? (
          <p className="text-muted-foreground mt-4 text-[13px]">
            <time
              dateTime={post.createdAt.toISOString()}
              suppressHydrationWarning
            >
              {post.createdAt.toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}
              {post.createdAt.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </time>
          </p>
        ) : null}

        <div
          className={cn(
            "flex items-center gap-3",
            expanded
              ? "-mx-4 mt-3 border-t px-2 py-1.5 sm:-mx-5 sm:px-3"
              : "mt-2 -ml-2.5"
          )}
        >
          <ReactionPicker
            postId={post.id}
            counts={post.reactionCounts}
            mine={post.myReaction}
            onReact={onReact}
            onUnreact={onUnreact}
          />
          <Link
            // On the post's own page this would link to itself and do nothing: jump to the comment box instead.
            href={expanded ? `#${COMMENT_FORM_ID}` : `/feed/${post.id}`}
            onClick={
              expanded
                ? (event) => {
                    event.preventDefault();
                    const form = document.getElementById(COMMENT_FORM_ID);
                    form?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    form
                      ?.querySelector("textarea")
                      ?.focus({ preventScroll: true });
                  }
                : undefined
            }
            aria-label={
              post.commentCount === 0
                ? "Comment"
                : post.commentCount === 1
                  ? "1 comment"
                  : `${post.commentCount} comments`
            }
            className={`${ACTION} hover:bg-chart-4/10 hover:text-chart-4`}
          >
            <MessageCircle aria-hidden className="size-[17px]" />
            {post.commentCount > 0 ? post.commentCount : null}
          </Link>
          <button
            type="button"
            aria-label="Copy link to post"
            onClick={handleShare}
            className={`${ACTION} hover:bg-chart-3/10 hover:text-chart-3 ${
              shareStatus === "copied" ? "text-chart-3" : ""
            }`}
          >
            {shareStatus === "copied" ? (
              <Check
                aria-hidden
                className="animate-in zoom-in-50 size-[17px] duration-200"
              />
            ) : (
              <Share aria-hidden className="size-[17px]" />
            )}
          </button>
          {shareStatus !== "idle" ? (
            <span
              role="status"
              className="text-muted-foreground animate-in fade-in slide-in-from-left-1 text-xs duration-200"
            >
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
