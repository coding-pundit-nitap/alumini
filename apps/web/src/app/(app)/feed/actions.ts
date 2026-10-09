"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { runAction } from "@/app/_actions/run-action";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  react,
  unreact,
  updatePost,
} from "@/composition/posts";
import {
  claimReport,
  dismissReport,
  fileContentReport,
  resolveReport,
} from "@/composition/moderation";
import {
  completeUpload,
  getUploadStatus,
  presignUpload,
} from "@/composition/uploads";
import type { ActionResult } from "@/lib/action-result";
import { assertObjectInput } from "@/lib/form-data";
import { ValidationError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import type {
  CompleteUploadResult,
  PresignUploadResult,
  UploadStatusResult,
} from "@/modules/uploads";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseId(field: string, value: string): string {
  if (!UUID.test(value)) {
    throw new ValidationError({
      details: [{ field, code: "INVALID", message: "That was not found." }],
    });
  }
  return value;
}

export async function createPostAction(
  input: unknown
): Promise<ActionResult<{ postId: string }>> {
  return runAction(async () => {
    const result = await createPost({ actor: await getActor(), input });
    refresh();
    return result;
  });
}

export async function deletePostAction(
  postId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await deletePost({
      actor: await getActor(),
      postId: parseId("postId", postId),
    });
    refresh();
    return {};
  });
}

export async function updatePostAction(
  postId: string,
  input: unknown
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await updatePost({
      actor: await getActor(),
      postId: parseId("postId", postId),
      input,
    });
    refresh();
    return {};
  });
}

/** After deleting, there is nothing left to show, so go home. */
export async function deletePostAndGoHomeAction(
  postId: string
): Promise<ActionResult<Record<string, never>>> {
  const result = await runAction(async () => {
    await deletePost({
      actor: await getActor(),
      postId: parseId("postId", postId),
    });
    refresh();
    return {};
  });
  if (result.ok) redirect("/dashboard");
  return result;
}

export async function addCommentAction(
  postId: string,
  input: unknown
): Promise<ActionResult<{ commentId: string }>> {
  return runAction(async () => {
    const comment = await addComment({
      actor: await getActor(),
      postId: parseId("postId", postId),
      input,
    });
    refresh();
    return { commentId: comment.id };
  });
}

export async function deleteCommentAction(
  commentId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await deleteComment({
      actor: await getActor(),
      commentId: parseId("commentId", commentId),
    });
    refresh();
    return {};
  });
}

export async function reactAction(
  postId: string,
  input: unknown
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await react({
      actor: await getActor(),
      postId: parseId("postId", postId),
      input,
    });
    refresh();
    return {};
  });
}

export async function unreactAction(
  postId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await unreact({
      actor: await getActor(),
      postId: parseId("postId", postId),
    });
    refresh();
    return {};
  });
}

export async function reportContentAction(
  input: unknown
): Promise<ActionResult<{ reportId: string; created: boolean }>> {
  return runAction(async () => {
    const result = await fileContentReport({ actor: await getActor(), input });
    refresh();
    return result;
  });
}

export async function claimReportAction(
  reportId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await claimReport({
      actor: await getActor(),
      reportId: parseId("reportId", reportId),
    });
    refresh();
    return {};
  });
}

export async function resolveReportAction(
  reportId: string,
  reason: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await resolveReport({
      actor: await getActor(),
      reportId: parseId("reportId", reportId),
      input: { reason },
    });
    refresh();
    return {};
  });
}

export async function dismissReportAction(
  reportId: string,
  reason: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await dismissReport({
      actor: await getActor(),
      reportId: parseId("reportId", reportId),
      input: { reason },
    });
    refresh();
    return {};
  });
}

/** Post images reuse the PROFILE_PHOTO upload purpose; `createPost` only checks ownership and READY status. */
export async function presignPostImageAction(input: {
  mime: string;
  size: number;
}): Promise<ActionResult<PresignUploadResult>> {
  return runAction(async () => {
    assertObjectInput(input);
    return presignUpload({
      actor: await getActor(),
      mime: input.mime,
      size: input.size,
    });
  });
}

export async function completePostImageAction(
  uploadId: string
): Promise<ActionResult<CompleteUploadResult>> {
  return runAction(async () =>
    completeUpload({
      actor: await getActor(),
      uploadId: parseId("uploadId", uploadId),
    })
  );
}

export async function getPostImageStatusAction(
  uploadId: string
): Promise<ActionResult<UploadStatusResult>> {
  return runAction(async () =>
    getUploadStatus({
      actor: await getActor(),
      uploadId: parseId("uploadId", uploadId),
    })
  );
}
