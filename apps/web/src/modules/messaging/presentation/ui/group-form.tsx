"use client";

import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import { MAX_GROUP_SIZE } from "../../domain/messaging";
import type { Person } from "../../application/messaging-store";

/** Start a group from the caller's connections. The server re-validates everything (2–19 members, verified, no blocks). */
export function GroupForm({
  candidates,
  createAction,
}: {
  candidates: Person[];
  createAction: (input: {
    title?: string;
    memberIds: string[];
  }) => Promise<ActionResult<{ conversationId: string }>>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (candidates.length < 2) {
    return (
      <p className="text-muted-foreground">
        Connect with at least two members to start a group.
      </p>
    );
  }
  const valid = chosen.length >= 2 && chosen.length <= MAX_GROUP_SIZE - 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      const name = title.trim();
      const result = await createAction({
        ...(name ? { title: name } : {}),
        memberIds: chosen,
      });
      if (result.ok) router.push(`/messages/${result.data.conversationId}`);
      else setError(result.error.message);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">
        Group name (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Choose 2 to {MAX_GROUP_SIZE - 1} members.
        </legend>
        {candidates.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(p.id)}
              onChange={(e) =>
                setChosen((prev) =>
                  e.target.checked
                    ? [...prev, p.id]
                    : prev.filter((id) => id !== p.id)
                )
              }
            />
            {p.fullName}
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!valid || pending}>
        Create group
      </Button>
    </form>
  );
}
