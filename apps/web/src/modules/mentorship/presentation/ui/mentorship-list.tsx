"use client";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Badge } from "@nitap/ui/components/badge";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { TickedAvatar } from "@nitap/ui/components/role-tick";
import {
  GraduationCap,
  Inbox,
  MessageCircle,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import type {
  MentorshipAction,
  MentorshipState,
} from "../../domain/mentorship";
import type { ListedMentorship } from "../../application/mentorship-store";
import { useMentorshipAction } from "./use-mentorship-action";

export type MentorshipTab =
  "find" | "my-requests" | "requests" | "mentees" | "settings";
type ListTab = Extract<MentorshipTab, "my-requests" | "requests" | "mentees">;
type Transition = (
  id: string,
  action: MentorshipAction,
  note?: string
) => Promise<ActionResult<unknown>>;
type MessageAction = (
  userId: string
) => Promise<ActionResult<{ conversationId: string }>>;

const LABEL: Record<MentorshipState, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

const TONE: Record<MentorshipState, "brand" | "success" | "secondary"> = {
  REQUESTED: "brand",
  ACCEPTED: "success",
  ACTIVE: "success",
  COMPLETED: "secondary",
  DECLINED: "secondary",
  CANCELLED: "secondary",
};

const EMPTY: Record<ListTab, { text: string; icon: LucideIcon }> = {
  "my-requests": { text: "No requests yet.", icon: GraduationCap },
  requests: { text: "No requests waiting for you.", icon: Inbox },
  mentees: { text: "No current mentees.", icon: UsersRound },
};

const PILL = "rounded-full";

/** Opens (or starts) the 1:1 with the other person. Its own component: only it needs the router. */
function MessageControl({
  userId,
  action,
  onError,
}: {
  userId: string;
  action: MessageAction;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className={PILL}
      disabled={opening}
      onClick={() => {
        onError(null);
        startOpening(async () => {
          const result = await action(userId);
          if (result.ok) router.push(`/messages/${result.data.conversationId}`);
          else onError(result.error.message);
        });
      }}
    >
      <MessageCircle aria-hidden />
      Message
    </Button>
  );
}

function Row({
  item,
  tab,
  transitionAction,
  messageAction,
}: {
  item: ListedMentorship;
  tab: ListTab;
  transitionAction: Transition;
  messageAction?: MessageAction;
}) {
  const { pending, error, run } = useMentorshipAction();
  const [messageError, setMessageError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const go = (action: MentorshipAction, text?: string) =>
    run(() => transitionAction(item.id, action, text));

  const cancelMentorship = confirming ? (
    <>
      <Button
        size="sm"
        variant="destructive"
        className={PILL}
        disabled={pending}
        onClick={() => go("cancel")}
      >
        Confirm cancel
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={PILL}
        onClick={() => setConfirming(false)}
      >
        Keep
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      className={cn(PILL, "text-muted-foreground hover:text-destructive")}
      onClick={() => setConfirming(true)}
    >
      Cancel mentorship
    </Button>
  );
  const open = item.state === "ACCEPTED" || item.state === "ACTIVE";
  const message =
    open && messageAction ? (
      <MessageControl
        userId={item.counterparty.id}
        action={messageAction}
        onError={setMessageError}
      />
    ) : null;

  let actions: React.ReactNode = null;
  if (tab === "my-requests") {
    if (item.state === "REQUESTED") {
      actions = (
        <Button
          size="sm"
          variant="ghost"
          className={cn(PILL, "text-muted-foreground")}
          disabled={pending}
          onClick={() => go("cancel")}
        >
          Cancel request
        </Button>
      );
    } else if (open)
      actions = (
        <>
          {message}
          {cancelMentorship}
        </>
      );
  } else if (tab === "requests" && item.state === "REQUESTED") {
    actions = declining ? null : (
      <>
        <Button
          size="sm"
          variant="brand"
          className={PILL}
          disabled={pending}
          onClick={() => go("accept")}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={PILL}
          disabled={pending}
          onClick={() => setDeclining(true)}
        >
          Decline
        </Button>
      </>
    );
  } else if (tab === "mentees" && open) {
    actions = (
      <>
        {item.state === "ACCEPTED" ? (
          <Button
            size="sm"
            variant="brand"
            className={PILL}
            disabled={pending}
            onClick={() => go("start")}
          >
            Mark as started
          </Button>
        ) : (
          <Button
            size="sm"
            variant="brand"
            className={PILL}
            disabled={pending}
            onClick={() => go("complete")}
          >
            Mark completed
          </Button>
        )}
        {message}
        {cancelMentorship}
      </>
    );
  }

  const latest =
    item.endedAt ?? item.startedAt ?? item.respondedAt ?? item.requestedAt;

  return (
    <li className="hover:bg-muted/30 px-4 py-4 transition-colors sm:px-5">
      <div className="flex items-start gap-3">
        <TickedAvatar tick={item.counterparty.tick}>
          <InitialsAvatar
            name={item.counterparty.fullName}
            seed={item.counterparty.id}
            src={
              item.counterparty.hasPhoto
                ? `/api/photos/${item.counterparty.id}`
                : null
            }
            size="lg"
            className="size-11"
          />
        </TickedAvatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 leading-tight">
              <Link
                href={`/members/${item.counterparty.id}`}
                className="block truncate font-medium underline-offset-2 hover:underline"
              >
                {item.counterparty.fullName}
              </Link>
              <p
                className="text-muted-foreground text-xs"
                suppressHydrationWarning
              >
                {item.topic ? `Topic: ${item.topic} · ` : ""}
                <time dateTime={latest.toISOString()}>
                  {relativeTime(latest)}
                </time>
              </p>
            </div>
            <Badge variant={TONE[item.state]} className="shrink-0">
              {LABEL[item.state]}
            </Badge>
          </div>
          <p className="border-border text-foreground/90 border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-line">
            {item.message}
          </p>
          {item.responseNote ? (
            <p className="bg-muted/60 rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Note from the mentor:
              </span>{" "}
              {item.responseNote}
            </p>
          ) : null}
          {declining ? (
            <div className="space-y-2 pt-1">
              <label className="block space-y-1 text-sm">
                <span className="font-medium">
                  Note for the student (optional)
                </span>
                <textarea
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={PILL}
                  disabled={pending}
                  onClick={() => go("decline", note.trim() || undefined)}
                >
                  Send decline
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={PILL}
                  onClick={() => setDeclining(false)}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : null}
          {actions ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {actions}
            </div>
          ) : null}
          {error || messageError ? (
            <p role="alert" className="text-destructive text-sm">
              {error ?? messageError}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * One list of the caller's own mentorships, with the actions that fit its tab and each row's state.
 * `messageAction` adds Message to accepted and active mentorships — passed in because this module does not
 * depend on messaging.
 */
export function MentorshipList({
  items,
  tab,
  transitionAction,
  messageAction,
}: {
  items: ListedMentorship[];
  tab: ListTab;
  transitionAction: Transition;
  messageAction?: MessageAction;
}) {
  if (items.length === 0) {
    const { text, icon: Icon } = EMPTY[tab];
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">{text}</p>
        {tab === "my-requests" ? (
          <Link
            href="/mentorship?tab=find"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: PILL,
            })}
          >
            Browse mentors
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="divide-border divide-y">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          tab={tab}
          transitionAction={transitionAction}
          messageAction={messageAction}
        />
      ))}
    </ul>
  );
}
