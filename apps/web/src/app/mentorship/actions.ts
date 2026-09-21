"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import { saveMentorProfile } from "@/composition/mentorship";
import type { ActionResult } from "@/lib/action-result";
import { getActor } from "@/modules/auth";

/** Mentorship Server Actions (FR-MENTOR). Each use case authorizes and validates again; the page re-renders after. */
export async function saveMentorProfileAction(
  input: unknown
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    await saveMentorProfile({ actor: await getActor(), input });
    refresh();
    return { saved: true as const };
  });
}
