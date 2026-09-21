"use client";

import { useActionState } from "react";

import type { ItemAction, ItemActionResult } from "./detail-form-support";
import { formError } from "./detail-form-support";

/** One read-only row for the owner's editing page: a summary, an optional Edit link, and a Remove form. */
export function DetailItemRow({
  summary,
  detail,
  editHref,
  removeAction,
  id,
}: {
  summary: string;
  detail?: string;
  editHref?: string;
  removeAction: ItemAction;
  id: string;
}) {
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => removeAction(formData), null);

  return (
    <li className="border-border flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{summary}</p>
        {detail ? (
          <p className="text-muted-foreground text-sm">{detail}</p>
        ) : null}
        {formError(result) ? (
          <p role="alert" className="text-destructive text-sm">
            {formError(result)}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {editHref ? (
          <a href={editHref} className="text-sm underline">
            Edit
          </a>
        ) : null}
        <form action={submit}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="text-destructive text-sm underline disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove"}
          </button>
        </form>
      </div>
    </li>
  );
}
