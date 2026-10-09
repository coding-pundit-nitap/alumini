"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { ItemAction, ItemActionResult } from "./detail-form-support";
import { formError } from "./detail-form-support";

const ACTION =
  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:opacity-50";

/**
 * One read-only row for the owner's editing page: an optional leading tile, a
 * summary, an Edit link and a Remove form. The action labels hide on small
 * screens but stay as the accessible names.
 */
export function DetailItemRow({
  summary,
  detail,
  editHref,
  removeAction,
  id,
  leading,
}: {
  summary: string;
  detail?: string;
  editHref?: string;
  removeAction: ItemAction;
  id: string;
  leading?: ReactNode;
}) {
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => removeAction(formData), null);

  return (
    <li
      className={cn(
        "hover:bg-muted/40 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,opacity] duration-150",
        pending && "opacity-50"
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{summary}</p>
        {detail ? (
          <p className="text-muted-foreground truncate text-xs">{detail}</p>
        ) : null}
        {formError(result) ? (
          <p role="alert" className="text-destructive text-sm">
            {formError(result)}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {editHref ? (
          <a href={editHref} className={ACTION}>
            <Pencil aria-hidden className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Edit</span>
          </a>
        ) : null}
        <form action={submit}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className={cn(
              ACTION,
              "hover:bg-destructive/10 hover:text-destructive"
            )}
          >
            <Trash2 aria-hidden className="size-3.5" />
            <span className="sr-only sm:not-sr-only">
              {pending ? "Removing…" : "Remove"}
            </span>
          </button>
        </form>
      </div>
    </li>
  );
}
