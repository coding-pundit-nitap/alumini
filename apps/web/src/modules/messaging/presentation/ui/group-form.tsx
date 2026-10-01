"use client";

import { Button } from "@nitap/ui/components/button";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import { MAX_GROUP_SIZE } from "../../domain/messaging";
import type { Person } from "../../application/messaging-store";
import { photoOf } from "./conversation-avatar";

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
      <p className="text-muted-foreground px-6 py-10 text-center text-sm">
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
    <form
      method="post"
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
        <label className="block text-sm font-medium">
          Group name (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="e.g. CSE batch of 2020"
            className="border-input bg-background focus-visible:ring-ring mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-normal outline-none focus-visible:ring-2"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">
            Choose 2 to {MAX_GROUP_SIZE - 1} members.
          </legend>
          <p className="text-muted-foreground mt-0.5 text-xs">
            From your connections · {chosen.length} selected
          </p>
          <ul className="-mx-2 mt-3">
            {candidates.map((p) => {
              const on = chosen.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="hover:bg-muted/60 has-focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors has-focus-visible:ring-2">
                    <InitialsAvatar
                      name={p.fullName}
                      seed={p.id}
                      src={photoOf(p)}
                      size="lg"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {p.fullName}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={p.fullName}
                      checked={on}
                      onChange={(e) =>
                        setChosen((prev) =>
                          e.target.checked
                            ? [...prev, p.id]
                            : prev.filter((id) => id !== p.id)
                        )
                      }
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex size-5 items-center justify-center rounded-full border transition-colors duration-150 ${
                        on ? "bg-brand border-brand text-brand-foreground" : ""
                      }`}
                    >
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
      <div className="bg-background border-t px-4 py-3 sm:px-6">
        {error ? (
          <p role="alert" className="text-destructive mb-2 text-sm">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="brand"
          disabled={!valid || pending}
          className="w-full rounded-full"
        >
          Create group
        </Button>
      </div>
    </form>
  );
}
