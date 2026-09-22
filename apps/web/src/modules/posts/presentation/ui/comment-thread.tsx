"use client";

import { Button } from "@nitap/ui/components/button";
import { Textarea } from "@nitap/ui/components/textarea";
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { CommentRow } from "../../application/posts-store";
import { MarkdownView } from "./markdown-view";

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
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} className="border-border border-b pb-3 text-sm">
            <MarkdownView content={comment.body} />
            {currentUserId === comment.authorId ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="mt-1"
                onClick={() => onDeleteComment(comment.id)}
              >
                Delete
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-1.5">
        <label htmlFor={bodyId} className="text-sm font-medium">
          Add a comment
        </label>
        <Textarea
          id={bodyId}
          value={body}
          maxLength={MAX_BODY}
          onChange={(event) => setBody(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Post comment
        </Button>
      </form>
    </div>
  );
}
