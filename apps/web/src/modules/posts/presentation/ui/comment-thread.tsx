"use client";

import { Loader2, MessageCircle, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@nitap/ui/components/button";

import type { ActionResult } from "@/lib/action-result";

import type { CommentRow, PostAuthor } from "../../application/posts-store";
import { MarkdownView } from "./markdown-view";
import { PostAuthorAvatar, PostAuthorLine } from "./post-author";

type AddCommentAction = (
  postId: string,
  input: { body: string }
) => Promise<ActionResult<{ commentId: string }>>;
type DeleteCommentAction = (
  commentId: string
) => Promise<ActionResult<Record<string, never>>>;

type WireComment = Omit<CommentRow, "createdAt"> & { createdAt: string };

/** The add-comment form's id, so the post's comment action can jump to it. */
export const COMMENT_FORM_ID = "add-comment";

const MAX_BODY = 2000;
const COUNTER_THRESHOLD = 1800;

/**
 * A post's comments, newest first, under an add-comment form; own comments carry a delete button. The server
 * renders the first page (`comments`, refreshed after every add/delete); older pages stream in as you scroll
 * (`GET /api/v1/posts/:id/comments?cursor=`), with "Load more comments" as the fallback. `viewer` puts the
 * member's avatar beside the form.
 */
export function CommentThread({
  postId,
  comments: firstPage,
  nextCursor: firstCursor = null,
  currentUserId,
  viewer,
  onAddComment,
  onDeleteComment,
}: {
  postId: string;
  comments: CommentRow[];
  nextCursor?: string | null;
  currentUserId: string | null;
  viewer?: PostAuthor;
  onAddComment: AddCommentAction;
  onDeleteComment: DeleteCommentAction;
}) {
  const [older, setOlder] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState(firstCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const moreRef = useRef<HTMLDivElement>(null);

  // First page from the server, then the pages loaded here; a comment can sit in both once new ones push it
  // off page one, so dedupe by id.
  const seen = new Set<string>();
  const comments = [...firstPage, ...older].filter(
    (c) => !removed.has(c.id) && !seen.has(c.id) && seen.add(c.id)
  );

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadFailed(false);
    try {
      const res = await fetch(
        `/api/v1/posts/${postId}/comments?cursor=${encodeURIComponent(cursor)}`
      );
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as {
        comments: WireComment[];
        nextCursor: string | null;
      };
      setOlder((previous) => [
        ...previous,
        ...page.comments.map((c) => ({
          ...c,
          createdAt: new Date(c.createdAt),
        })),
      ]);
      setCursor(page.nextCursor);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, postId]);

  useEffect(() => {
    const el = moreRef.current;
    if (!el || loadFailed || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, loadFailed]);

  async function remove(commentId: string) {
    const result = await onDeleteComment(commentId);
    if (result.ok) setRemoved((prev) => new Set(prev).add(commentId));
  }

  const bodyId = useId();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_BODY && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await onAddComment(postId, { body: trimmed });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setBody("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div>
      <form
        id={COMMENT_FORM_ID}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex gap-3 border-b px-4 py-4 sm:px-5"
      >
        {viewer ? <PostAuthorAvatar author={viewer} /> : null}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={bodyId} className="sr-only">
              Add a comment
            </label>
            <textarea
              id={bodyId}
              rows={1}
              placeholder="Add a comment…"
              value={body}
              maxLength={MAX_BODY}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={onKeyDown}
              className="placeholder:text-muted-foreground block field-sizing-content max-h-60 min-h-8 w-full resize-none bg-transparent py-1 text-[15px] leading-relaxed outline-none"
            />
            {error ? (
              <p role="alert" className="text-destructive mt-1 text-sm">
                {error}
              </p>
            ) : null}
            {body.length > COUNTER_THRESHOLD ? (
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {body.length}/{MAX_BODY}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            variant="brand"
            size="sm"
            disabled={!canSubmit}
            className="rounded-full px-4"
          >
            Comment
          </Button>
        </div>
      </form>

      {comments.length === 0 && !cursor ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <MessageCircle aria-hidden className="size-5" />
          </span>
          <p className="font-medium">No comments yet</p>
          <p className="text-muted-foreground text-sm">
            Start the conversation.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {comments.map((comment, i) => (
            <li
              key={comment.id}
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              className="group/comment animate-in fade-in slide-in-from-bottom-1 fill-mode-both px-4 py-4 duration-300 sm:px-5"
            >
              <div className="flex items-start justify-between gap-2">
                <PostAuthorLine
                  author={comment.author}
                  createdAt={comment.createdAt}
                  currentUserId={currentUserId}
                  size="sm"
                />
                {currentUserId === comment.authorId ? (
                  <button
                    type="button"
                    aria-label="Delete comment"
                    onClick={() => void remove(comment.id)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-[opacity,color,background-color] duration-150 outline-none group-hover/comment:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                ) : null}
              </div>
              {/* Aligns with the name: 32px avatar + 12px gap. */}
              <div className="mt-1 pl-11 text-[15px] leading-relaxed">
                <MarkdownView content={comment.body} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <div
          ref={moreRef}
          className="flex flex-col items-center gap-1 border-t py-4"
        >
          {loadingMore ? (
            <Loader2
              aria-label="Loading more comments"
              className="text-muted-foreground size-5 animate-spin"
            />
          ) : (
            <>
              {loadFailed ? (
                <p className="text-muted-foreground text-xs">
                  Couldn&apos;t load more comments.
                </p>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground rounded-full"
                onClick={() => void loadMore()}
              >
                {loadFailed ? "Try again" : "Load more comments"}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
