import { avatarTone } from "@nitap/ui/lib/avatar-tone";

import { cn } from "@/lib/utils";

import { monogram } from "./format";

/**
 * A company or institution tile: its initials on a tint that stays the same
 * wherever it appears.
 */
export function ItemTile({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
        avatarTone(name.toLowerCase()),
        className
      )}
    >
      {monogram(name)}
    </span>
  );
}
