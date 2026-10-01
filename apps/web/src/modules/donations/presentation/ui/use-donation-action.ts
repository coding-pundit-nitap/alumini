"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

/** One Server Action at a time; shows the first field message, else the safe message (as admin dialogs do). */
export function useDonationAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(
    action: () => Promise<ActionResult<T>>,
    onSuccess?: (data: T) => void
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(
          Object.values(result.error.fields ?? {})[0] ?? result.error.message
        );
        return;
      }
      onSuccess?.(result.data);
    });
  }

  return { pending, error, setError, run };
}
