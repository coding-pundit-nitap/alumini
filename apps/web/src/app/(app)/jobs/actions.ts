"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  approveJob,
  closeJob,
  createJob,
  editJob,
  rejectJob,
} from "@/composition/jobs";
import type { ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseId(field: string, value: string): string {
  if (!UUID.test(value)) {
    throw new ValidationError({
      details: [{ field, code: "INVALID", message: "That job was not found." }],
    });
  }
  return value;
}

/** Jobs Server Actions. Each use case authorizes and validates again; the page re-renders after. */
export async function createJobAction(
  input: unknown
): Promise<ActionResult<{ jobId: string; status: string }>> {
  return runAction(async () => {
    const result = await createJob({ actor: await getActor(), input });
    refresh();
    return result;
  });
}

export async function editJobAction(
  jobId: string,
  input: unknown
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const result = await editJob({
      actor: await getActor(),
      jobId: parseId("jobId", jobId),
      input,
    });
    refresh();
    return result;
  });
}

export async function approveJobAction(
  jobId: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const result = await approveJob({
      actor: await getActor(),
      jobId: parseId("jobId", jobId),
    });
    refresh();
    return result;
  });
}

export async function rejectJobAction(
  jobId: string,
  reviewNote: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const result = await rejectJob({
      actor: await getActor(),
      jobId: parseId("jobId", jobId),
      input: { reviewNote },
    });
    refresh();
    return result;
  });
}

export async function closeJobAction(
  jobId: string
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const result = await closeJob({
      actor: await getActor(),
      jobId: parseId("jobId", jobId),
    });
    refresh();
    return result;
  });
}
