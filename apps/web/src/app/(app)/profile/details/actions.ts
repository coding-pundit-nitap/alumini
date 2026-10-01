"use server";

import { refresh } from "next/cache";

import {
  educationUseCases,
  experienceUseCases,
  linkUseCases,
  skillUseCases,
} from "@/composition/users";
import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import type { ActionResult } from "@/lib/action-result";
import { getActor } from "@/modules/auth";
import {
  parseEducationForm,
  parseExperienceForm,
  parseItemId,
  parseLinkForm,
  parseSkillForm,
} from "@/modules/users";

/**
 * 12 thin Server Actions, one add/update/remove per detail collection (spec 3B). Every one takes the
 * caller from the session, reads only its own named fields (the item schema, or just `id`), and lets the
 * use case authorize and enforce the cap/uniqueness/ownership. No action reads a user id from the form.
 *
 * `refresh()` re-renders the current route's Server Components after a successful mutation, so the list
 * on /profile/details reflects the change without a full navigation (this Next.js version does not
 * re-render automatically; server-actions.md: "an action that does none of [updateTag/revalidatePath/
 * refresh] carries only its return value, and the current route is not re-rendered").
 */

export async function addExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseExperienceForm(formData);
    const item = await experienceUseCases.add({
      actor: await getActor(),
      input,
    });
    refresh();
    return item;
  });
}
export async function updateExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    const input = parseExperienceForm(formData);
    const item = await experienceUseCases.update({
      actor: await getActor(),
      itemId,
      input,
    });
    refresh();
    return item;
  });
}
export async function removeExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    await experienceUseCases.remove({ actor: await getActor(), itemId });
    refresh();
  });
}

export async function addEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseEducationForm(formData);
    const item = await educationUseCases.add({
      actor: await getActor(),
      input,
    });
    refresh();
    return item;
  });
}
export async function updateEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    const input = parseEducationForm(formData);
    const item = await educationUseCases.update({
      actor: await getActor(),
      itemId,
      input,
    });
    refresh();
    return item;
  });
}
export async function removeEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    await educationUseCases.remove({ actor: await getActor(), itemId });
    refresh();
  });
}

export async function addSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseSkillForm(formData);
    const item = await skillUseCases.add({ actor: await getActor(), input });
    refresh();
    return item;
  });
}
export async function updateSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    const input = parseSkillForm(formData);
    const item = await skillUseCases.update({
      actor: await getActor(),
      itemId,
      input,
    });
    refresh();
    return item;
  });
}
export async function removeSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    await skillUseCases.remove({ actor: await getActor(), itemId });
    refresh();
  });
}

export async function addLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const input = parseLinkForm(formData);
    const item = await linkUseCases.add({ actor: await getActor(), input });
    refresh();
    return item;
  });
}
export async function updateLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    const input = parseLinkForm(formData);
    const item = await linkUseCases.update({
      actor: await getActor(),
      itemId,
      input,
    });
    refresh();
    return item;
  });
}
export async function removeLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(formData);
    const itemId = parseItemId(formData);
    await linkUseCases.remove({ actor: await getActor(), itemId });
    refresh();
  });
}
