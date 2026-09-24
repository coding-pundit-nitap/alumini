"use client";

import {
  HandHeart,
  Lightbulb,
  PartyPopper,
  SmilePlus,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";

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

/** Text colour and hover tint per reaction, from the theme's chart palette. */
const TONE: Record<ReactionType, string> = {
  LIKE: "text-brand bg-brand/10",
  CELEBRATE: "text-chart-5 bg-chart-5/10",
  SUPPORT: "text-chart-3 bg-chart-3/10",
  INSIGHTFUL: "text-chart-2 bg-chart-2/10",
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

/** A one-click Like toggle plus a "More reactions" tray for the other three (FR-FEED-003). */
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
  // Reactions others used, most popular first: a small social-proof stack next to the count.
  const used = REACTION_TYPES.filter((t) => state.counts[t] > 0)
    .sort((a, b) => state.counts[b] - state.counts[a])
    .slice(0, 3);

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label="React to this post"
    >
      <button
        type="button"
        aria-pressed={active !== null}
        onClick={() => apply(active ? null : "LIKE")}
        className={cn(
          "focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2",
          active
            ? TONE[active]
            : "text-muted-foreground hover:bg-brand/10 hover:text-brand"
        )}
      >
        <ActiveIcon
          // Remount on change so the icon pops each time the reaction flips.
          key={active ?? "none"}
          aria-hidden
          className={cn(
            "size-[17px]",
            active &&
              "animate-in zoom-in-50 spin-in-12 fill-current/15 duration-300"
          )}
        />
        <span className="sr-only">{active ? LABEL[active] : "Like"}</span>
        {total > 0 ? <span>{total}</span> : null}
      </button>
      {used.length > 1 ? (
        <span aria-hidden className="mr-1 flex -space-x-1">
          {used.map((t) => {
            const Icon = ICON[t];
            return (
              <span
                key={t}
                className={cn(
                  "ring-background flex size-[18px] items-center justify-center rounded-full ring-2",
                  TONE[t]
                )}
              >
                <Icon className="size-2.5" />
              </span>
            );
          })}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More reactions"
          render={
            <button
              type="button"
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring data-[popup-open]:bg-muted flex size-8 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
            />
          }
        >
          <SmilePlus aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="flex w-auto min-w-0 flex-row gap-1 rounded-full p-1.5"
        >
          {REACTION_TYPES.map((type, i) => {
            const Icon = ICON[type];
            return (
              <DropdownMenuItem
                key={type}
                onClick={() => apply(type)}
                title={LABEL[type]}
                style={{ animationDelay: `${i * 40}ms` }}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both group/reaction relative flex size-10 flex-col items-center justify-center gap-0 rounded-full p-0 duration-300 hover:-translate-y-1 hover:scale-110",
                  state.mine === type && TONE[type]
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-5!", TONE[type].split(" ")[0])}
                />
                <span className="sr-only">{LABEL[type]}</span>
                <span className="text-muted-foreground text-[9px] leading-none tabular-nums">
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
