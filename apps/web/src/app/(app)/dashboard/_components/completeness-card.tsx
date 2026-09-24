import Link from "next/link";

import { Block } from "./lists";

/** H-7: hides once the profile is complete. */
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
        <div className="bg-brand h-full" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-muted-foreground py-2 text-xs">
        Still missing: {missing.join(", ")}
      </p>
      <Link
        href="/profile/details"
        className="text-brand text-sm font-medium hover:underline"
      >
        Finish profile
      </Link>
    </Block>
  );
}
