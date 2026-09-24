"use client";

import { Button } from "@nitap/ui/components/button";
import { Textarea } from "@nitap/ui/components/textarea";
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { CommentRow } from "../../application/posts-store";
import { MarkdownView } from "./markdown-view";
import { PostAuthorLine } from "./post-author";

type AddCommentAction = (
  postId: string,
  input: { body: string }
) => Promise<ActionResult<{ commentId: string }>>;
type DeleteCommentAction = (
  commentId: string
) => Promise<ActionResult<Record<string, never>>>;

const MAX_BODY = 2000;

/** A post's comments (oldest first, as returned) plus an add-comment form; own comments carry a delete button. */
export function CommentThread({
  postId,
  comments,
  currentUserId,
  onAddComment,
  onDeleteComment,
}: {
  postId: string;
  comments: CommentRow[];
  currentUserId: string | null;
  onAddComment: AddCommentAction;
  onDeleteComment: DeleteCommentAction;
}) {
  const bodyId = useId();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_BODY && !submitting;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
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

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-1.5">
        <label htmlFor={bodyId} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={bodyId}
          rows={2}
          placeholder="Add a comment…"
          value={body}
          maxLength={MAX_BODY}
          onChange={(event) => setBody(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="brand" size="sm" disabled={!canSubmit}>
          Comment
        </Button>
      </form>

      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            <PostAuthorLine
              author={comment.author}
              createdAt={comment.createdAt}
              currentUserId={currentUserId}
              size="sm"
            />
            <div className="bg-muted/60 rounded-2xl rounded-tl-sm px-3 py-2 text-sm">
              <MarkdownView content={comment.body} />
            </div>
            {currentUserId === comment.authorId ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onDeleteComment(comment.id)}
              >
                Delete
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
