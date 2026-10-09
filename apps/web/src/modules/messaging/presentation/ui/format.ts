const DAY_MS = 86_400_000;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole local calendar days from `date` to `now` (0 = today). */
const daysAgo = (date: Date, now: Date) =>
  Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);

/** Local calendar-day key, for grouping messages into days. */
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export const clockTime = (date: Date) =>
  date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * The thread's day separator: Today, Yesterday, a weekday within the week, else
 * a full date.
 */
export function dayLabel(date: Date, now = new Date()): string {
  const days = daysAgo(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7)
    return date.toLocaleDateString("en-IN", { weekday: "long" });
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The inbox's timestamp: a time today, then Yesterday, a short weekday, else a
 * short date.
 */
export function inboxStamp(date: Date, now = new Date()): string {
  const days = daysAgo(date, now);
  if (days === 0) return clockTime(date);
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7)
    return date.toLocaleDateString("en-IN", { weekday: "short" });
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "2-digit" }),
  });
}
