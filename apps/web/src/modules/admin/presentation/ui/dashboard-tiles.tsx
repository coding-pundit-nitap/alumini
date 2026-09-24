import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";

import type { MembersSummary } from "../../application/admin-store";
import type { DashboardTile } from "../../application/get-dashboard";
import type { TileKey } from "../../domain/access";

const TILE_COPY: Record<TileKey, { label: string; href: string }> = {
  pendingVerifications: {
    label: "Verification requests pending",
    href: "/admin/verification",
  },
  openReports: { label: "Open reports", href: "/admin/reports" },
  pendingJobs: { label: "Jobs awaiting review", href: "/admin/jobs" },
  pendingAchievements: {
    label: "Achievements awaiting review",
    href: "/admin/achievements",
  },
  failedEmails: {
    label: "Failed notification emails",
    href: "/admin/notifications",
  },
  members: { label: "Verified members", href: "/admin/users" },
};

function Value({ tile }: { tile: DashboardTile }) {
  if (tile.status === "unavailable")
    return (
      <span className="text-muted-foreground text-sm font-normal">
        Unavailable
      </span>
    );
  if (typeof tile.value === "number")
    return <span className="text-3xl tabular-nums">{tile.value}</span>;
  const m: MembersSummary = tile.value;
  return (
    <span className="flex flex-col gap-1">
      <span className="text-3xl tabular-nums">{m.byState.VERIFIED ?? 0}</span>
      <span className="text-muted-foreground text-sm font-normal">
        {m.byState.PENDING ?? 0} pending · {m.byState.SUSPENDED ?? 0} suspended
        · {m.newLast7Days} new this week
      </span>
    </span>
  );
}

/** FR-ADMIN-001: one card per tile the actor may act on (spec A12-5). */
export function DashboardTiles({ tiles }: { tiles: DashboardTile[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const copy = TILE_COPY[tile.key];
        return (
          <Link
            key={tile.key}
            href={copy.href}
            aria-label={copy.label}
            className="focus-visible:ring-ring/50 rounded-xl outline-none hover:opacity-90 focus-visible:ring-3"
          >
            <Card className="h-full">
              <CardHeader>
                <CardDescription>{copy.label}</CardDescription>
                <CardTitle>
                  <Value tile={tile} />
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
