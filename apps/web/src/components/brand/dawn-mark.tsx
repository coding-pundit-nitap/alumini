import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

interface DawnMarkProps {
  className?: string;
}

export function DawnMark({ className }: DawnMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-7", className)}
    >
      <circle cx="16" cy="19" r="7" fill="var(--brand)" />
      <polygon points="2,28 12,12 18,20 22,15 30,28" fill="currentColor" />
      <line
        x1="0"
        y1="28"
        x2="32"
        y2="28"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.2"
      />
    </svg>
  );
}

interface WordmarkProps {
  compact?: boolean;
}

export function Wordmark({ compact }: WordmarkProps) {
  return (
    <span className="flex items-center gap-2">
      <DawnMark />
      <span className="font-semibold tracking-tight">
        {compact ? (
          siteConfig.shortName
        ) : (
          <>
            <span className="sm:hidden">{siteConfig.shortName}</span>
            <span className="hidden sm:inline">{siteConfig.name}</span>
          </>
        )}
      </span>
    </span>
  );
}
