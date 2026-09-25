"use client";

import { useState, useTransition } from "react";

import { cn } from "@nitap/ui/lib/utils";

import { RoleTick } from "@nitap/ui/components/role-tick";
import type { ActionResult } from "@/lib/action-result";
import { NO_TICK, type Tick } from "@/lib/role-tick";

import { AUTO_TICK } from "../../application/badge-role";

/**
 * UI-15: pick the tick on your photo. Saves on choice; the previous choice comes back if saving fails.
 * Automatic follows the highest role held, so it keeps up when roles change.
 */
export function BadgeRolePicker({
  options,
  choice: initial,
  action,
}: {
  options: Tick[];
  choice: string;
  action: (choice: string) => Promise<ActionResult<{ saved: true }>>;
}) {
  const [choice, setChoice] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    const previous = choice;
    setChoice(next);
    setStatus("idle");
    startTransition(async () => {
      const result = await action(next);
      if (result.ok) {
        setStatus("saved");
      } else {
        setChoice(previous);
        setStatus(result.error.message);
      }
    });
  }

  const rows: { value: string; label: string; hint: string; tick?: Tick }[] = [
    {
      value: AUTO_TICK,
      label: "Automatic",
      hint: `Your highest role${options[0] ? ` — ${options[0].label} now` : ""}`,
      tick: options[0],
    },
    ...options.map((tick) => ({
      value: tick.role,
      label: tick.label,
      hint: "Always show this role",
      tick,
    })),
    {
      value: NO_TICK,
      label: "Don't show a tick",
      hint: "Your photo shows plain",
    },
  ];

  return (
    <fieldset disabled={pending} className="space-y-2">
      <legend className="sr-only">Profile tick</legend>
      {rows.map((row) => (
        <label
          key={row.value}
          className={cn(
            "has-focus-visible:ring-ring/60 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors has-focus-visible:ring-2",
            choice === row.value
              ? "border-primary bg-muted/60"
              : "hover:bg-muted/40"
          )}
        >
          <input
            type="radio"
            name="badge-role"
            value={row.value}
            checked={choice === row.value}
            onChange={() => choose(row.value)}
            className="accent-primary"
          />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-medium">{row.label}</span>
            <span className="text-muted-foreground block text-xs">
              {row.hint}
            </span>
          </span>
          {row.tick && row.value !== NO_TICK ? (
            <RoleTick tick={row.tick} size="md" />
          ) : null}
        </label>
      ))}
      <p
        role={status !== "idle" && status !== "saved" ? "alert" : "status"}
        className={cn(
          "min-h-5 text-xs",
          status === "saved" ? "text-success" : "text-destructive"
        )}
      >
        {pending
          ? ""
          : status === "saved"
            ? "Saved."
            : status === "idle"
              ? ""
              : status}
      </p>
    </fieldset>
  );
}
