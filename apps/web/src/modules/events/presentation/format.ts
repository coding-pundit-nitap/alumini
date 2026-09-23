/**
 * Display helpers for events. Always formats with an explicit `timeZone`: on the server the
 * "local" zone is the server's, which is nobody's, so the event's own zone is the one shown.
 */
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
