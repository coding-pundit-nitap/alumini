import Link from "next/link";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Profile {percent}% complete</CardTitle>
        <CardDescription>Still missing: {missing.join(", ")}</CardDescription>
        <CardAction>
          <Link
            href="/profile/details"
            className={buttonVariants({ size: "sm" })}
          >
            Finish profile
          </Link>
        </CardAction>
        <div
          role="progressbar"
          aria-label="Profile completeness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="bg-muted col-span-full mt-2 h-2 overflow-hidden rounded-full"
        >
          <div className="bg-primary h-full" style={{ width: `${percent}%` }} />
        </div>
      </CardHeader>
    </Card>
  );
}
