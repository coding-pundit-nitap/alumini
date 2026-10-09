import { Badge } from "@nitap/ui/components/badge";

import type { EventSummary } from "../../application/event-queries";
import type { RegistrationState } from "../../domain/event";

const HOLDS_A_SEAT: ReadonlyArray<RegistrationState | null> = [
  "REGISTERED",
  "ATTENDED",
  "NO_SHOW",
];

/**
 * Status badges shared by the list rows and the detail page. The place has its
 * own line (`EventPlace`).
 */
export function EventBadges({ event }: { event: EventSummary }) {
  const cancelled = event.status === "CANCELLED";
  const full = event.spotsRemaining <= 0;
  const registered = HOLDS_A_SEAT.includes(event.viewer.registrationState);
  if (!cancelled && !full && !registered) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
      {full ? <Badge variant="secondary">Full</Badge> : null}
      {registered ? <Badge variant="success">Registered</Badge> : null}
    </div>
  );
}
