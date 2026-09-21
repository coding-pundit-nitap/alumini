"use server";

import {
  educationUseCases,
  experienceUseCases,
  linkUseCases,
  skillUseCases,
} from "@/composition/users";
import { runAction } from "@/app/_actions/run-action";
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
 */

export async function addExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = parseExperienceForm(formData);
    return experienceUseCases.add({ actor: await getActor(), input });
  });
}
export async function updateExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    const input = parseExperienceForm(formData);
    return experienceUseCases.update({
      actor: await getActor(),
      itemId,
      input,
    });
  });
}
export async function removeExperienceAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    return experienceUseCases.remove({ actor: await getActor(), itemId });
  });
}

export async function addEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = parseEducationForm(formData);
    return educationUseCases.add({ actor: await getActor(), input });
  });
}
export async function updateEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    const input = parseEducationForm(formData);
    return educationUseCases.update({ actor: await getActor(), itemId, input });
  });
}
export async function removeEducationAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    return educationUseCases.remove({ actor: await getActor(), itemId });
  });
}

export async function addSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = parseSkillForm(formData);
    return skillUseCases.add({ actor: await getActor(), input });
  });
}
export async function updateSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    const input = parseSkillForm(formData);
    return skillUseCases.update({ actor: await getActor(), itemId, input });
  });
}
export async function removeSkillAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    return skillUseCases.remove({ actor: await getActor(), itemId });
  });
}

export async function addLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const input = parseLinkForm(formData);
    return linkUseCases.add({ actor: await getActor(), input });
  });
}
export async function updateLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    const input = parseLinkForm(formData);
    return linkUseCases.update({ actor: await getActor(), itemId, input });
  });
}
export async function removeLinkAction(
  formData: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const itemId = parseItemId(formData);
    return linkUseCases.remove({ actor: await getActor(), itemId });
  });
}
