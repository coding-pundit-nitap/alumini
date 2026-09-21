"use client";

import { Button } from "@nitap/ui/components/button";
import Link from "next/link";
import { useState } from "react";

import type { ActionResult } from "@/lib/action-result";

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

const LABEL: Record<MentorshipState, string> = {
  REQUESTED: "Requested",
  ACCEPTED: "Accepted",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

function Row({
  item,
  tab,
  transitionAction,
}: {
  item: ListedMentorship;
  tab: ListTab;
  transitionAction: Transition;
}) {
  const { pending, error, run } = useMentorshipAction();
  const [confirming, setConfirming] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const go = (action: MentorshipAction, text?: string) =>
    run(() => transitionAction(item.id, action, text));

  const cancelMentorship = confirming ? (
    <>
      <Button size="sm" disabled={pending} onClick={() => go("cancel")}>
        Confirm cancel
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Cancel mentorship
    </Button>
  );
  const open = item.state === "ACCEPTED" || item.state === "ACTIVE";

  let actions: React.ReactNode = null;
  if (tab === "my-requests") {
    if (item.state === "REQUESTED") {
      actions = (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => go("cancel")}
        >
          Cancel request
        </Button>
      );
    } else if (open) actions = cancelMentorship;
  } else if (tab === "requests" && item.state === "REQUESTED") {
    actions = (
      <>
        <Button size="sm" disabled={pending} onClick={() => go("accept")}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
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
          <Button size="sm" disabled={pending} onClick={() => go("start")}>
            Mark as started
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => go("complete")}>
            Mark completed
          </Button>
        )}
        {cancelMentorship}
      </>
    );
  }

  return (
    <li className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/members/${item.counterparty.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {item.counterparty.fullName}
          </Link>
          {item.topic ? (
            <p className="text-muted-foreground text-sm">Topic: {item.topic}</p>
          ) : null}
          <p className="text-sm">{item.message}</p>
          {item.responseNote ? (
            <p className="text-muted-foreground text-sm">
              Note from the mentor: {item.responseNote}
            </p>
          ) : null}
        </div>
        <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 text-xs">
          {LABEL[item.state]}
        </span>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      {declining ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            <span>Note for the student (optional)</span>
            <textarea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => go("decline", note.trim() || undefined)}
            >
              Send decline
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeclining(false)}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** One list of the caller's own mentorships, with the actions that fit its tab and each row's state. */
export function MentorshipList({
  items,
  tab,
  transitionAction,
}: {
  items: ListedMentorship[];
  tab: ListTab;
  transitionAction: Transition;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {tab === "my-requests" ? (
          <>
            No requests yet.{" "}
            <Link href="/mentorship?tab=find" className="underline">
              Browse mentors
            </Link>
          </>
        ) : tab === "requests" ? (
          "No requests waiting for you."
        ) : (
          "No current mentees."
        )}
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          tab={tab}
          transitionAction={transitionAction}
        />
      ))}
    </ul>
  );
}
