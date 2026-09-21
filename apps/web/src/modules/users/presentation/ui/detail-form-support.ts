"use client";

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
