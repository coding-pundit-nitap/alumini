import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { TickedAvatar } from "@nitap/ui/components/role-tick";

import { cn } from "@/lib/utils";

import type { Person } from "../../application/messaging-store";

/** Window events that keep an open inbox in step with an open thread in the same tab. */
export const MESSAGES_READ_EVENT = "messages:read";
export const MESSAGES_CHANGED_EVENT = "messages:changed";

type Named = { title: string | null; participants: Person[] };

const others = (c: Named, viewerId: string) =>
  c.participants.filter((p) => p.id !== viewerId);

/** A group by its title, else everyone else's names, else "Conversation". */
export const conversationLabel = (c: Named, viewerId: string) =>
  c.title ??
  (others(c, viewerId)
    .map((p) => p.fullName)
    .join(", ") ||
    "Conversation");

export const photoOf = (p: Person) =>
  p.hasPhoto ? `/api/photos/${p.id}` : null;

/** The other member's face for a 1:1; two overlapping faces for a group. */
export function ConversationAvatar({
  conversation,
  viewerId,
  isGroup,
  className,
}: {
  conversation: Named;
  viewerId: string;
  isGroup: boolean;
  className?: string;
}) {
  const [first, second] = others(conversation, viewerId);
  if (!first) {
    return (
      <InitialsAvatar
        name={conversationLabel(conversation, viewerId)}
        seed={conversationLabel(conversation, viewerId)}
        size="lg"
        className={className}
      />
    );
  }
  if (!isGroup || !second) {
    return (
      <TickedAvatar tick={first.tick}>
        <InitialsAvatar
          name={first.fullName}
          seed={first.id}
          src={photoOf(first)}
          size="lg"
          className={className}
        />
      </TickedAvatar>
    );
  }
  return (
    <span className={cn("relative block size-10 shrink-0", className)}>
      <InitialsAvatar
        name={first.fullName}
        seed={first.id}
        src={photoOf(first)}
        className="absolute top-0 left-0 size-7"
      />
      <InitialsAvatar
        name={second.fullName}
        seed={second.id}
        src={photoOf(second)}
        className="ring-background absolute right-0 bottom-0 size-7 ring-2"
      />
    </span>
  );
}
