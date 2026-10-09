import { BadgeCheck } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * What kind of account a tick marks; the colour follows the kind, the label
 * names the role.
 */
export type TickKind =
  "student" | "alumni" | "faculty" | "staff" | "team" | "institute";

type Tick = { label: string; kind: TickKind };

// Literal class strings so Tailwind's scanner picks them up. The seal is filled with the kind's colour;
// its stroke (the outline and the check) takes the page background, so it reads on any photo.
const FILL: Record<TickKind, string> = {
  student: "fill-chart-4",
  alumni: "fill-brand",
  faculty: "fill-success",
  staff: "fill-chart-5",
  team: "fill-muted-foreground",
  institute: "fill-amber-500",
};

const SIZE = { sm: "size-3.5", md: "size-[18px]", lg: "size-7" } as const;
type Size = keyof typeof SIZE;

/**
 * The seal alone, e.g. next to a name. Hover shows the role; screen readers
 * hear "Verified {role}".
 */
export function RoleTick({
  tick,
  size = "md",
  className,
}: {
  tick: Tick;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      title={`Verified ${tick.label}`}
      data-tick={tick.kind}
      className={cn("inline-flex shrink-0", className)}
    >
      <BadgeCheck
        aria-hidden
        strokeWidth={2.25}
        className={cn("text-background", FILL[tick.kind], SIZE[size])}
      />
      <span className="sr-only">Verified {tick.label}</span>
    </span>
  );
}

/**
 * An avatar with the member's tick on its bottom-right corner (nothing extra
 * when they have none).
 */
export function TickedAvatar({
  tick,
  size = "md",
  className,
  children,
}: {
  tick?: Tick | null;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}) {
  if (!tick) return <>{children}</>;
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {children}
      <RoleTick
        tick={tick}
        size={size}
        className={cn(
          "absolute",
          size === "lg" ? "right-0.5 bottom-0.5" : "-right-1 -bottom-1"
        )}
      />
    </span>
  );
}
