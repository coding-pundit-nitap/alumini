"use client";

import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { Person } from "../../application/messaging-store";

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
    <section aria-labelledby="members-heading" className="space-y-3">
      <h2 id="members-heading" className="text-lg font-semibold">
        Members
      </h2>
      <ul className="space-y-1">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between text-sm">
            <span>
              {p.id === viewerId ? `${p.fullName} (you)` : p.fullName}
            </span>
            {isCreator && p.id !== viewerId ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => removeAction(conversationId, p.id),
                    () => router.refresh()
                  )
                }
              >
                Remove {p.fullName}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {isCreator && addable.length > 0 ? (
        <div className="flex items-end gap-2">
          <label className="text-sm font-medium">
            Add member
            <select
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              className="border-input bg-background mt-1 block rounded-md border px-3 py-2 text-sm"
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
