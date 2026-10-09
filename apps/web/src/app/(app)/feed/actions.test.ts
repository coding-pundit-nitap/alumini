import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ "x-request-id": "req-1" }),
  refresh: vi.fn(),
  redirect: vi.fn(),
  getActor: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  react: vi.fn(),
  unreact: vi.fn(),
  fileContentReport: vi.fn(),
  claimReport: vi.fn(),
  resolveReport: vi.fn(),
  dismissReport: vi.fn(),
  presignUpload: vi.fn(),
  completeUpload: vi.fn(),
  getUploadStatus: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth", () => ({ getActor: mocks.getActor }));
vi.mock("@/composition/posts", () => ({
  createPost: mocks.createPost,
  updatePost: mocks.updatePost,
  deletePost: mocks.deletePost,
  addComment: mocks.addComment,
  deleteComment: mocks.deleteComment,
  react: mocks.react,
  unreact: mocks.unreact,
}));
vi.mock("@/composition/moderation", () => ({
  fileContentReport: mocks.fileContentReport,
  claimReport: mocks.claimReport,
  resolveReport: mocks.resolveReport,
  dismissReport: mocks.dismissReport,
}));
vi.mock("@/composition/uploads", () => ({
  presignUpload: mocks.presignUpload,
  completeUpload: mocks.completeUpload,
  getUploadStatus: mocks.getUploadStatus,
}));

import { NotFoundError } from "@/lib/errors";

import * as actions from "./actions";

const actor = { userId: "u1", accountState: "VERIFIED" };
const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function") mock.mockReset();
  }
  mocks.getActor.mockResolvedValue(actor);
});

describe("feed Server Actions", () => {
  it("create, edit and delete a post with the session's actor, then refresh", async () => {
    mocks.createPost.mockResolvedValue({ postId: id });
    expect(await actions.createPostAction({ content: "hi" })).toEqual({
      ok: true,
      data: { postId: id },
    });
    expect(mocks.createPost).toHaveBeenCalledWith({
      actor,
      input: { content: "hi" },
    });

    expect(await actions.updatePostAction(id, { content: "new" })).toEqual({
      ok: true,
      data: {},
    });
    expect(mocks.updatePost).toHaveBeenCalledWith({
      actor,
      postId: id,
      input: { content: "new" },
    });

    expect(await actions.deletePostAction(id)).toEqual({ ok: true, data: {} });
    expect(mocks.deletePost).toHaveBeenCalledWith({ actor, postId: id });
    expect(mocks.refresh).toHaveBeenCalledTimes(3);
  });

  it("send the caller home after deleting from the post's own page, and stay on failure", async () => {
    expect(await actions.deletePostAndGoHomeAction(id)).toEqual({
      ok: true,
      data: {},
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");

    mocks.redirect.mockReset();
    mocks.deletePost.mockRejectedValue(new NotFoundError());
    expect(await actions.deletePostAndGoHomeAction(id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuse an id that is not a uuid before calling the use case", async () => {
    for (const call of [
      () => actions.deletePostAction("x"),
      () => actions.updatePostAction("x", {}),
      () => actions.addCommentAction("x", {}),
      () => actions.deleteCommentAction("x"),
      () => actions.reactAction("x", {}),
      () => actions.unreactAction("x"),
      () => actions.claimReportAction("x"),
      () => actions.resolveReportAction("x", "r"),
      () => actions.dismissReportAction("x", "r"),
      () => actions.completePostImageAction("x"),
      () => actions.getPostImageStatusAction("x"),
    ]) {
      expect(await call()).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
    expect(mocks.deletePost).not.toHaveBeenCalled();
    expect(mocks.claimReport).not.toHaveBeenCalled();
  });

  it("comment, react and unreact", async () => {
    mocks.addComment.mockResolvedValue({ id: "c1" });
    expect(await actions.addCommentAction(id, { body: "b" })).toEqual({
      ok: true,
      data: { commentId: "c1" },
    });
    expect(mocks.addComment).toHaveBeenCalledWith({
      actor,
      postId: id,
      input: { body: "b" },
    });
    await actions.deleteCommentAction(id);
    expect(mocks.deleteComment).toHaveBeenCalledWith({ actor, commentId: id });
    await actions.reactAction(id, { type: "LIKE" });
    expect(mocks.react).toHaveBeenCalledWith({
      actor,
      postId: id,
      input: { type: "LIKE" },
    });
    await actions.unreactAction(id);
    expect(mocks.unreact).toHaveBeenCalledWith({ actor, postId: id });
  });

  it("report, claim, resolve and dismiss", async () => {
    mocks.fileContentReport.mockResolvedValue({ reportId: id, created: true });
    expect(
      await actions.reportContentAction({ targetType: "POST" })
    ).toMatchObject({ ok: true, data: { reportId: id, created: true } });
    await actions.claimReportAction(id);
    expect(mocks.claimReport).toHaveBeenCalledWith({ actor, reportId: id });
    await actions.resolveReportAction(id, "spam");
    expect(mocks.resolveReport).toHaveBeenCalledWith({
      actor,
      reportId: id,
      input: { reason: "spam" },
    });
    await actions.dismissReportAction(id, "fine");
    expect(mocks.dismissReport).toHaveBeenCalledWith({
      actor,
      reportId: id,
      input: { reason: "fine" },
    });
  });

  it("run the post image upload flow", async () => {
    mocks.presignUpload.mockResolvedValue({ uploadId: id });
    expect(
      await actions.presignPostImageAction({ mime: "image/png", size: 10 })
    ).toMatchObject({ ok: true, data: { uploadId: id } });
    expect(mocks.presignUpload).toHaveBeenCalledWith({
      actor,
      mime: "image/png",
      size: 10,
    });
    expect(
      await actions.presignPostImageAction(
        null as unknown as { mime: string; size: number }
      )
    ).toMatchObject({ ok: false });

    mocks.completeUpload.mockResolvedValue({ status: "READY" });
    expect(await actions.completePostImageAction(id)).toMatchObject({
      ok: true,
      data: { status: "READY" },
    });
    mocks.getUploadStatus.mockResolvedValue({
      status: "PENDING_SCAN",
      rejectReason: null,
    });
    expect(await actions.getPostImageStatusAction(id)).toMatchObject({
      ok: true,
      data: { status: "PENDING_SCAN" },
    });
  });
});
