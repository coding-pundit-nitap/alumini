"use server";

import { refresh } from "next/cache";

import { runAction } from "@/app/_actions/run-action";
import {
  addComment,
  createPost,
  deleteComment,
  deletePost,
  react,
  unreact,
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

/**
 * Feed Server Actions (FR-FEED, FR-MOD). Plain-value arguments, called from client buttons/forms; each
 * use case authorizes and validates again, and the page re-renders afterwards (mirrors
 * app/connections/actions.ts and app/messages/actions.ts's wrapper pattern).
 */
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
  reportId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await resolveReport({
      actor: await getActor(),
      reportId: parseId("reportId", reportId),
    });
    refresh();
    return {};
  });
}

export async function dismissReportAction(
  reportId: string
): Promise<ActionResult<Record<string, never>>> {
  return runAction(async () => {
    await dismissReport({
      actor: await getActor(),
      reportId: parseId("reportId", reportId),
    });
    refresh();
    return {};
  });
}

/**
 * PostComposer's image pickers (spec 3C flow, reused as-is): the underlying upload rows are still
 * tagged `purpose: "PROFILE_PHOTO"` (uploads' one current purpose) and gated on `profile.update`, which
 * every verified member holds (MEMBER_BASELINE) — `createPost`'s `uploadsReady` check only cares about
 * ownership and READY status, not purpose, so this works today. Mirrors app/profile/photo-actions.ts.
 */
export async function presignPostImageAction(input: {
  mime: string;
  size: number;
}): Promise<ActionResult<PresignUploadResult>> {
  return runAction(async () =>
    presignUpload({
      actor: await getActor(),
      mime: input.mime,
      size: input.size,
    })
  );
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
