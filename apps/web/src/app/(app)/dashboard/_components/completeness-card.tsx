import Link from "next/link";

import { Block } from "./lists";

/** Hides once the profile is complete. */
export function CompletenessCard({
  percent,
  missing,
}: {
  percent: number;
  missing: string[];
}) {
  if (percent >= 100) return null;
  return (
    <Block title={`Profile ${percent}% complete`}>
      <div
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
      >
        <div
          className="from-brand to-chart-2 animate-in slide-in-from-left-full h-full rounded-full bg-gradient-to-r duration-700"
          style={{ width: `${Math.max(percent, 3)}%` }}
        />
      </div>
      <p className="text-muted-foreground py-2 text-xs">
        Still missing: {missing.join(", ")}
      </p>
      <Link
        href="/profile/details"
        className="text-brand inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        Finish profile
      </Link>
    </Block>
  );
}
