"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

/**
 * Runs one Server Action at a time, shows its safe message on failure. The
 * action itself refreshes the page.
 */
export function useConnectionAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult<unknown>>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error.message);
    });
  }

  return { pending, error, run };
}
