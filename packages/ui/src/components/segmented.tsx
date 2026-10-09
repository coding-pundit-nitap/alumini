import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * Pill track for a small set of mutually exclusive links or buttons; style each
 * with `segmentedItemVariants`.
 */
function Segmented({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="segmented"
      className={cn(
        "bg-muted/70 inline-flex items-center gap-0.5 rounded-full border p-0.5",
        className
      )}
      {...props}
    />
  );
}

const segmentedItemVariants = cva(
  "focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-200 outline-none focus-visible:ring-2",
  {
    variants: {
      active: {
        true: "bg-background text-foreground shadow-[0_1px_2px_0_color-mix(in_oklch,var(--foreground)_12%,transparent)]",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { active: false },
  }
);

export { Segmented, segmentedItemVariants };
