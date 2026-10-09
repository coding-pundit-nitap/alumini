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

/** Return to the list after a saved edit; `refresh()` alone would keep showing the form. */
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
