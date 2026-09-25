"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  setBadgeRole,
  updateOwnPrivacy,
  updateOwnProfile,
} from "@/composition/users";
import type { ActionResult } from "@/lib/action-result";
import { refresh } from "next/cache";
import { getActor } from "@/modules/auth";
import { parsePrivacyForm, parseProfileForm } from "@/modules/users";

/**
 * A Server Action is a public POST endpoint, so both actions take the caller from the session, read only
 * the named form fields, and let the use case authorize. There is no user id anywhere in the input.
 */
export async function updateProfileAction(
  formData: FormData
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    const input = parseProfileForm(formData);
    await updateOwnProfile({ actor: await getActor(), input });
    return { saved: true as const };
  });
}

export async function updatePrivacyAction(
  formData: FormData
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    const input = parsePrivacyForm(formData);
    await updateOwnPrivacy({ actor: await getActor(), input });
    return { saved: true as const };
  });
}

/** UI-15: which tick shows on the caller's photo ("AUTO", a held role, or "NONE"). */
export async function setBadgeRoleAction(
  choice: string
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    await setBadgeRole({ actor: await getActor(), choice });
    refresh();
    return { saved: true as const };
  });
}
