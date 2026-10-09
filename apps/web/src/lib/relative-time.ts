const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" (<60s or future, clock skew), "5m", "3h", "2d" (<7d), else "12
 * Mar" (same year) / "12 Mar 2025".
 */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;

  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
  // ICU's en-GB short month for September is "Sept"; we want "Sep".
  return formatted.replace("Sept", "Sep");
}
