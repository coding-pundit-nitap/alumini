import { MapPin, Video } from "lucide-react";

import { cn } from "@nitap/ui/lib/utils";

import { dateBlock, spotsLabel } from "../format";

/**
 * A calendar-page date: ember month band over the day, both in the event's own
 * zone.
 */
export function DateBlock({
  startsAt,
  timezone,
  size = "default",
  muted = false,
}: {
  startsAt: Date;
  timezone: string;
  size?: "default" | "lg";
  muted?: boolean;
}) {
  const { month, day } = dateBlock(startsAt, timezone);
  return (
    <span
      aria-hidden
      className={cn(
        "border-border bg-background flex shrink-0 flex-col items-center self-start overflow-hidden rounded-xl border leading-none",
        size === "lg" ? "w-16" : "w-12",
        muted && "opacity-60"
      )}
    >
      <span
        className={cn(
          "w-full py-1 text-center font-semibold tracking-wider uppercase",
          muted
            ? "bg-muted text-muted-foreground"
            : "bg-brand text-brand-foreground",
          size === "lg" ? "text-[11px]" : "text-[10px]"
        )}
      >
        {month}
      </span>
      <span
        className={cn(
          "py-1.5 font-semibold tabular-nums",
          size === "lg" ? "text-2xl" : "text-lg"
        )}
      >
        {day}
      </span>
    </span>
  );
}

/**
 * "N of M spots left" over a thin fill bar; the bar is decorative, the text
 * carries the numbers.
 */
export function SpotsMeter({
  remaining,
  capacity,
  className,
}: {
  remaining: number;
  capacity: number;
  className?: string;
}) {
  const taken =
    capacity > 0 ? Math.min(1, (capacity - remaining) / capacity) : 1;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden
        className="bg-muted relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            remaining <= 0 ? "bg-muted-foreground" : "bg-brand"
          )}
          style={{ width: `${Math.round(taken * 100)}%` }}
        />
      </span>
      <span>{spotsLabel(remaining, capacity)}</span>
    </span>
  );
}

/**
 * "Online" with a video icon, or the venue ("In person" when none is set) with
 * a pin.
 */
export function EventPlace({
  isOnline,
  location,
}: {
  isOnline: boolean;
  location: string | null;
}) {
  const Icon = isOnline ? Video : MapPin;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">
        {isOnline ? "Online" : (location ?? "In person")}
      </span>
    </span>
  );
}
