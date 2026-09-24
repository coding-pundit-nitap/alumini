"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  requestMentorship,
  saveMentorProfile,
  transitionMentorship,
} from "@/composition/mentorship";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import type { MentorshipAction } from "@/modules/mentorship";

const ACTIONS = ["accept", "decline", "cancel", "start", "complete"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseId(field: string, value: string): string {
  if (!UUID.test(value)) {
    throw new ValidationError({
      details: [
        {
          field,
          code: "INVALID",
          message: "That mentor or mentorship was not found.",
        },
      ],
    });
  }
  return value;
}

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

export async function requestMentorshipAction(
  mentorId: string,
  input: { message: string; topic?: string }
): Promise<ActionResult<{ mentorshipId: string }>> {
  return runAction(async () => {
    const result = await requestMentorship({
      actor: await getActor(),
      mentorId: parseId("mentorId", mentorId),
      input,
    });
    refresh();
    return result;
  });
}

export async function transitionMentorshipAction(
  mentorshipId: string,
  action: MentorshipAction,
  note?: string
): Promise<ActionResult<{ state: string }>> {
  return runAction(async () => {
    if (!ACTIONS.includes(action)) {
      throw new ValidationError();
    }
    const result = await transitionMentorship({
      actor: await getActor(),
      mentorshipId: parseId("mentorshipId", mentorshipId),
      action,
      note,
    });
    refresh();
    return result;
  });
}
