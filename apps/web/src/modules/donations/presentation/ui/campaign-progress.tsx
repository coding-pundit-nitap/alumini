import { formatPaise, type CampaignProgress } from "../../domain/donation";

/**
 * Raised counts confirmed money only; open pledges are shown beside it, never
 * added in.
 */
export function CampaignProgressBar({
  progress,
  goalPaise,
}: {
  progress: CampaignProgress;
  goalPaise: number | null;
}) {
  const share =
    goalPaise && goalPaise > 0
      ? Math.min(100, (progress.raisedPaise / goalPaise) * 100)
      : null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm">
        <span className="font-semibold tabular-nums">
          {formatPaise(progress.raisedPaise)}
        </span>{" "}
        <span className="text-muted-foreground">
          received
          {goalPaise ? ` of ${formatPaise(goalPaise)}` : ""}
          {progress.donors > 0
            ? ` from ${progress.donors} donor${progress.donors === 1 ? "" : "s"}`
            : ""}
        </span>
      </p>
      {share !== null && (
        <div
          role="progressbar"
          aria-label="Received towards the goal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share)}
          className="bg-muted h-2 overflow-hidden rounded-full"
        >
          <div
            className="bg-brand h-full rounded-full"
            style={{ width: `${share}%` }}
          />
        </div>
      )}
      {progress.pledgedPaise > 0 && (
        <p className="text-muted-foreground text-xs">
          {formatPaise(progress.pledgedPaise)} pledged and awaiting confirmation
        </p>
      )}
    </div>
  );
}
