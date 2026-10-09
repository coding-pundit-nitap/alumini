"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  setBadgeRole,
  updateOwnPrivacy,
  updateOwnProfile,
} from "@/composition/users";
import type { ActionResult } from "@/lib/action-result";
import { assertFormData } from "@/lib/form-data";
import { refresh } from "next/cache";
import { getActor } from "@/modules/auth";
import { parsePrivacyForm, parseProfileForm } from "@/modules/users";

/** The caller comes from the session; no user id is read from the form. */
export async function updateProfileAction(
  formData: FormData
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseProfileForm(formData);
    await updateOwnProfile({ actor: await getActor(), input });
    return { saved: true as const };
  });
}

export async function updatePrivacyAction(
  formData: FormData
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parsePrivacyForm(formData);
    await updateOwnPrivacy({ actor: await getActor(), input });
    return { saved: true as const };
  });
}

/** Which tick shows on the caller's photo ("AUTO", a held role, or "NONE"). */
export async function setBadgeRoleAction(
  choice: string
): Promise<ActionResult<{ saved: true }>> {
  return runAction(async () => {
    await setBadgeRole({ actor: await getActor(), choice });
    refresh();
    return { saved: true as const };
  });
}
