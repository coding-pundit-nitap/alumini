"use client";

import {
  ChevronDown,
  HandHeart,
  Lightbulb,
  PartyPopper,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@nitap/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nitap/ui/components/dropdown-menu";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import type { ReactionType } from "../../domain/posts";
import { REACTION_TYPES } from "../../domain/posts";

const LABEL: Record<ReactionType, string> = {
  LIKE: "Like",
  CELEBRATE: "Celebrate",
  SUPPORT: "Support",
  INSIGHTFUL: "Insightful",
};

const ICON: Record<ReactionType, typeof ThumbsUp> = {
  LIKE: ThumbsUp,
  CELEBRATE: PartyPopper,
  SUPPORT: HandHeart,
  INSIGHTFUL: Lightbulb,
};

type ReactAction = (
  postId: string,
  input: { type: ReactionType }
) => Promise<ActionResult<Record<string, never>>>;
type UnreactAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;

type State = {
  mine: ReactionType | null;
  counts: Record<ReactionType, number>;
};

/** The reaction pill: a one-click Like toggle plus a "More reactions" menu for the other three (FR-FEED-003). */
export function ReactionPicker({
  postId,
  counts,
  mine,
  onReact,
  onUnreact,
}: {
  postId: string;
  counts: Record<ReactionType, number>;
  mine: ReactionType | null;
  onReact: ReactAction;
  onUnreact: UnreactAction;
}) {
  const [state, setState] = useState<State>({ mine, counts });
  // Re-seed from props without an effect (react-hooks/set-state-in-effect): adjust state
  // during render when the identity of either prop changes, per the React-documented pattern.
  const [seeded, setSeeded] = useState({ mine, counts });
  if (seeded.mine !== mine || seeded.counts !== counts) {
    setSeeded({ mine, counts });
    setState({ mine, counts });
  }

  async function apply(next: ReactionType | null) {
    const prev = state;
    const nextCounts = { ...prev.counts };
    if (prev.mine) nextCounts[prev.mine] -= 1;
    if (next) nextCounts[next] += 1;
    setState({ mine: next, counts: nextCounts });

    const result = next
      ? await onReact(postId, { type: next })
      : await onUnreact(postId);
    if (!result.ok) setState(prev);
  }

  const active = state.mine;
  const ActiveIcon = ICON[active ?? "LIKE"];
  const total = REACTION_TYPES.reduce(
    (sum, type) => sum + state.counts[type],
    0
  );

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label="React to this post"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={active !== null}
        onClick={() => apply(active ? null : "LIKE")}
        className={cn(
          "rounded-r-none",
          active && "text-brand bg-brand/10 hover:bg-brand/15 hover:text-brand"
        )}
      >
        <ActiveIcon />
        {active ? LABEL[active] : "Like"}
        {total > 0 ? <span>{total}</span> : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More reactions"
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className={cn(
                "rounded-l-none border-l",
                active &&
                  "text-brand bg-brand/10 hover:bg-brand/15 hover:text-brand"
              )}
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {REACTION_TYPES.map((type) => {
            const Icon = ICON[type];
            return (
              <DropdownMenuItem key={type} onClick={() => apply(type)}>
                <Icon />
                {LABEL[type]}
                <span className="text-muted-foreground ml-auto">
                  {state.counts[type]}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
