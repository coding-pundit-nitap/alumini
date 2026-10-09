/** Always formats in the event's own zone; the server's local zone is nobody's. */
export function formatEventTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export function spotsLabel(remaining: number, capacity: number): string {
  return `${remaining} of ${capacity} spots left`;
}

/**
 * Month ("Oct") and day ("1") of an instant in the event's own zone, for the
 * calendar-page date block.
 */
export function dateBlock(
  instant: Date,
  timeZone: string
): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { month: get("month"), day: get("day") };
}
