"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { ActionResult } from "@/lib/action-result";

export type ItemActionResult = ActionResult<unknown>;
export type ItemAction = (formData: FormData) => Promise<ItemActionResult>;

export function fieldErrors(
  result: ItemActionResult | null
): Record<string, string> {
  return result && !result.ok ? (result.error.fields ?? {}) : {};
}

export function formError(result: ItemActionResult | null): string | null {
  return result && !result.ok && !result.error.fields
    ? result.error.message
    : null;
}

/**
 * A successful edit leaves the `?edit=<section>:<id>` URL behind (the page decides what to render from
 * it, and the Server Action's own `refresh()` re-renders the current URL, not a different one). Without
 * this, the row would keep rendering as a form after a successful save. Add mode (`id` undefined) is
 * unaffected: `refresh()` alone is enough there, since the URL never changes.
 */
export function useReturnToListOnSavedEdit(
  section: string,
  id: string | undefined,
  result: ItemActionResult | null
) {
  const router = useRouter();
  useEffect(() => {
    if (id && result?.ok) router.replace(`/profile/details#${section}`);
  }, [id, result, router, section]);
}
