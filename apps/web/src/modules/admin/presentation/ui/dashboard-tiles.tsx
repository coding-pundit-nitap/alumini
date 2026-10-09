import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  Briefcase,
  Flag,
  HandCoins,
  MailWarning,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { MembersSummary } from "../../application/admin-store";
import type { DashboardTile } from "../../application/get-dashboard";
import type { TileKey } from "../../domain/access";

const TILE_COPY: Record<
  TileKey,
  { label: string; href: string; icon: LucideIcon }
> = {
  pendingVerifications: {
    label: "Verification requests pending",
    href: "/admin/verification",
    icon: UserCheck,
  },
  openReports: { label: "Open reports", href: "/admin/reports", icon: Flag },
  pendingJobs: {
    label: "Jobs awaiting review",
    href: "/admin/jobs",
    icon: Briefcase,
  },
  pendingAchievements: {
    label: "Achievements awaiting review",
    href: "/admin/achievements",
    icon: Award,
  },
  failedEmails: {
    label: "Failed notification emails",
    href: "/admin/notifications",
    icon: MailWarning,
  },
  pendingPledges: {
    label: "Pledges awaiting confirmation",
    href: "/admin/donations",
    icon: HandCoins,
  },
  members: { label: "Verified members", href: "/admin/users", icon: Users },
};

function StatusPill({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
        <span className="bg-brand size-1.5 rounded-full" aria-hidden />
        Needs attention
      </span>
    );
  return (
    <span className="bg-success/10 text-success inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
      All clear
    </span>
  );
}

function TileBody({ tile }: { tile: DashboardTile }) {
  const copy = TILE_COPY[tile.key];
  const Icon = copy.icon;

  if (tile.status === "unavailable")
    return (
      <>
        <div className="flex items-start justify-between">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
            <Icon aria-hidden className="size-4.5" />
          </span>
          <ArrowUpRight
            aria-hidden
            className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <p className="text-muted-foreground mt-4 text-sm">Unavailable</p>
        <p className="text-muted-foreground mt-1 text-sm">{copy.label}</p>
      </>
    );

  if (typeof tile.value === "number") {
    const value = tile.value;
    return (
      <>
        <div className="flex items-start justify-between">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
            <Icon aria-hidden className="size-4.5" />
          </span>
          <ArrowUpRight
            aria-hidden
            className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <p
          className={cn(
            "mt-4 text-4xl font-semibold tabular-nums",
            value > 0 && "text-brand"
          )}
        >
          {value}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">{copy.label}</p>
          <StatusPill value={value} />
        </div>
      </>
    );
  }

  const m: MembersSummary = tile.value;
  return (
    <>
      <div className="flex items-start justify-between">
        <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-4.5" />
        </span>
        <ArrowUpRight
          aria-hidden
          className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
      <p className="mt-4 text-4xl font-semibold tabular-nums">
        {m.byState.VERIFIED ?? 0}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">{copy.label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="bg-muted rounded-full px-2.5 py-1 text-xs">
          {m.byState.PENDING ?? 0} pending
        </span>
        <span className="bg-muted rounded-full px-2.5 py-1 text-xs">
          {m.byState.SUSPENDED ?? 0} suspended
        </span>
        <span className="bg-muted rounded-full px-2.5 py-1 text-xs">
          {m.newLast7Days} new this week
        </span>
      </div>
    </>
  );
}

/** One card per tile the actor may act on. */
export function DashboardTiles({ tiles }: { tiles: DashboardTile[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => {
        const copy = TILE_COPY[tile.key];
        return (
          <Link
            key={tile.key}
            href={copy.href}
            aria-label={copy.label}
            className={cn(
              "group bg-card hover:border-foreground/20 focus-visible:ring-ring rounded-xl border p-5 transition-colors outline-none focus-visible:ring-2",
              tile.key === "members" && "sm:col-span-2"
            )}
          >
            <TileBody tile={tile} />
          </Link>
        );
      })}
    </div>
  );
}
