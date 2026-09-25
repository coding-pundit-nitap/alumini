"use client";

import { Button } from "@nitap/ui/components/button";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { TickedAvatar } from "@nitap/ui/components/role-tick";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { Person } from "../../application/messaging-store";
import { photoOf } from "./conversation-avatar";

type Act<T> = Promise<ActionResult<T>>;

/**
 * The member list of a group thread. The creator removes members and adds from their connections; everyone
 * else can only leave (the creator cannot: a group always has its admin). The server enforces all of it.
 */
export function GroupMembers({
  conversationId,
  viewerId,
  createdById,
  people,
  candidates,
  addAction,
  removeAction,
}: {
  conversationId: string;
  viewerId: string;
  createdById: string;
  people: Person[];
  candidates: Person[];
  addAction: (
    conversationId: string,
    userId: string
  ) => Act<{ added: boolean }>;
  removeAction: (
    conversationId: string,
    userId: string
  ) => Act<Record<string, never>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState("");
  const isCreator = viewerId === createdById;

  function run(work: () => Act<unknown>, after: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) after();
      else setError(result.error.message);
    });
  }
  const addable = candidates.filter((c) => !people.some((p) => p.id === c.id));

  return (
    <section aria-labelledby="members-heading" className="space-y-4">
      <h2 id="members-heading" className="text-sm font-semibold">
        Members{" "}
        <span className="text-muted-foreground font-normal">
          {people.length}
        </span>
      </h2>
      <ul className="-mx-2">
        {people.map((p) => (
          <li
            key={p.id}
            className="hover:bg-muted/50 flex items-center gap-3 rounded-xl px-2 py-2 text-sm"
          >
            <TickedAvatar tick={p.tick}>
              <InitialsAvatar name={p.fullName} seed={p.id} src={photoOf(p)} />
            </TickedAvatar>
            <span className="min-w-0 flex-1 truncate font-medium">
              {p.id === viewerId ? `${p.fullName} (you)` : p.fullName}
              {p.id === createdById ? (
                <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                  Admin
                </span>
              ) : null}
            </span>
            {isCreator && p.id !== viewerId ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={() =>
                  run(
                    () => removeAction(conversationId, p.id),
                    () => router.refresh()
                  )
                }
              >
                Remove<span className="sr-only"> {p.fullName}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {isCreator && addable.length > 0 ? (
        <div className="flex items-end gap-2 border-t pt-4">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Add member
            <select
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              className="border-input bg-background mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm font-normal"
            >
              <option value="">Choose…</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={pending || !toAdd}
            onClick={() =>
              run(
                () => addAction(conversationId, toAdd),
                () => {
                  setToAdd("");
                  router.refresh();
                }
              )
            }
          >
            Add
          </Button>
        </div>
      ) : null}

      {!isCreator ? (
        <Button
          variant="outline"
          disabled={pending}
          className="text-destructive hover:text-destructive w-full rounded-full"
          onClick={() =>
            run(
              () => removeAction(conversationId, viewerId),
              () => router.push("/messages")
            )
          }
        >
          Leave group
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
