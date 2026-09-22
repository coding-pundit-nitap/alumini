"use client";

import { Button } from "@nitap/ui/components/button";

import type { ActionResult } from "@/lib/action-result";

import type { ReactionType } from "../../domain/posts";
import { REACTION_TYPES } from "../../domain/posts";

const LABEL: Record<ReactionType, string> = {
  LIKE: "Like",
  CELEBRATE: "Celebrate",
  SUPPORT: "Support",
  INSIGHTFUL: "Insightful",
};

type ReactAction = (
  postId: string,
  input: { type: ReactionType }
) => Promise<ActionResult<Record<string, never>>>;
type UnreactAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;

/** The four fixed reaction types (FR-FEED-003) as toggle buttons; clicking the active one unreacts. */
export function ReactionPicker({
  postId,
  mine,
  onReact,
  onUnreact,
}: {
  postId: string;
  mine: ReactionType | null;
  onReact: ReactAction;
  onUnreact: UnreactAction;
}) {
  async function onClick(type: ReactionType) {
    if (mine === type) {
      await onUnreact(postId);
    } else {
      await onReact(postId, { type });
    }
  }

  return (
    <div className="flex gap-1.5" role="group" aria-label="React to this post">
      {REACTION_TYPES.map((type) => (
        <Button
          key={type}
          type="button"
          size="sm"
          variant={mine === type ? "secondary" : "ghost"}
          aria-pressed={mine === type}
          onClick={() => onClick(type)}
        >
          {LABEL[type]}
        </Button>
      ))}
    </div>
  );
}
