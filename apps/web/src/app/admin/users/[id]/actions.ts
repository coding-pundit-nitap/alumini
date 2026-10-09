"use server";

import { runAction } from "@/app/_actions/run-action";
import { assertFormData } from "@/lib/form-data";
import {
  assignRole,
  changeAccountState,
  grantPermission,
  revokeGrant,
  revokeRole,
} from "@/composition/admin";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/modules/admin";
import { getActor } from "@/modules/auth";

/**
 * Only the named, non-empty fields: the use case's schema is strict, and the
 * actor is never a field.
 */
const pick = (form: FormData, keys: readonly string[]) =>
  Object.fromEntries(
    keys.flatMap((k) => {
      const v = form.get(k);
      return typeof v === "string" && v !== "" ? [[k, v]] : [];
    })
  );

/**
 * A malformed id would reach a `::uuid` cast and fail as a 500; it is simply
 * not found.
 */
const id = (form: FormData, key: string) => {
  const v = form.get(key);
  if (!isUuid(v)) throw new NotFoundError();
  return v;
};

export async function changeAccountStateAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return changeAccountState({
      actor: await getActor(),
      userId: id(form, "userId"),
      input: pick(form, ["accountState", "reason"]),
    });
  });
}

export async function assignRoleAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return assignRole({
      actor: await getActor(),
      userId: id(form, "userId"),
      input: pick(form, ["role"]),
    });
  });
}

export async function revokeRoleAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return revokeRole({
      actor: await getActor(),
      userId: id(form, "userId"),
      role: String(form.get("role") ?? ""),
    });
  });
}

export async function grantPermissionAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return grantPermission({
      actor: await getActor(),
      userId: id(form, "userId"),
      input: pick(form, ["permission", "scope", "chapterId", "expiresAt"]),
    });
  });
}

export async function revokeGrantAction(
  form: FormData
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    assertFormData(form);
    return revokeGrant({
      actor: await getActor(),
      userId: id(form, "userId"),
      grantId: id(form, "grantId"),
    });
  });
}
