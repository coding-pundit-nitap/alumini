import { Badge } from "@nitap/ui/components/badge";

import type { EventSummary } from "../../application/event-queries";
import type { RegistrationState } from "../../domain/event";

const HOLDS_A_SEAT: ReadonlyArray<RegistrationState | null> = [
  "REGISTERED",
  "ATTENDED",
  "NO_SHOW",
];

/** Status badges shared by the list cards and the detail page. */
export function EventBadges({ event }: { event: EventSummary }) {
  return (
    <div className="flex flex-wrap gap-2">
      {event.status === "CANCELLED" ? (
        <Badge variant="destructive">Cancelled</Badge>
      ) : null}
      {event.spotsRemaining <= 0 ? (
        <Badge variant="secondary">Full</Badge>
      ) : null}
      {HOLDS_A_SEAT.includes(event.viewer.registrationState) ? (
        <Badge variant="success">Registered</Badge>
      ) : null}
      <Badge variant="outline">
        {event.isOnline ? "Online" : (event.location ?? "In person")}
      </Badge>
    </div>
  );
}
