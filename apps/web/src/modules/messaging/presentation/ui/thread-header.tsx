import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Person } from "../../application/messaging-store";
import { ConversationAvatar, conversationLabel } from "./conversation-avatar";

const ROUND =
  "hover:bg-muted focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2";

/** The open pane's top bar: back to the inbox (phones), who this is with, and a slot for actions. */
export function PaneHeader({
  title,
  subtitle,
  avatar,
  actions,
}: {
  title: string;
  subtitle?: string;
  avatar?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="bg-background flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
      <Link
        href="/messages"
        aria-label="All messages"
        className={`${ROUND} -ml-1 md:hidden`}
      >
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      {avatar}
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

/** PaneHeader for a conversation: its avatar and name, "Direct message" or the group's size. */
export function ThreadHeader({
  conversation,
  viewerId,
  isGroup,
  actions,
}: {
  conversation: { title: string | null; participants: Person[] };
  viewerId: string;
  isGroup: boolean;
  actions?: ReactNode;
}) {
  return (
    <PaneHeader
      title={conversationLabel(conversation, viewerId)}
      subtitle={
        isGroup
          ? `Group · ${conversation.participants.length} members`
          : "Direct message"
      }
      avatar={
        <ConversationAvatar
          conversation={conversation}
          viewerId={viewerId}
          isGroup={isGroup}
        />
      }
      actions={actions}
    />
  );
}
