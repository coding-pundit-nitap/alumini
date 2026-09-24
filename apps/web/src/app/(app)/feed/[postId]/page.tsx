import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  addCommentAction,
  deleteCommentAction,
  deletePostAndGoHomeAction,
  dismissReportAction,
  reactAction,
  reportContentAction,
  resolveReportAction,
  unreactAction,
} from "../actions";
import { PageColumns } from "@/components/shell/page-columns";
import { getPost, listComments } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { CommentThread, PostCard } from "@/modules/posts";

export const metadata: Metadata = { title: "Post" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  if (!UUID.test(postId)) notFound();
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/feed/${postId}`)}`);

  let post, commentsPage;
  try {
    [post, commentsPage] = await Promise.all([
      getPost({ actor, postId }),
      listComments({ actor, postId }),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const canModerate =
    can(actor, PERMISSIONS.POST_MODERATE) ||
    can(actor, PERMISSIONS.REPORT_REVIEW);

  return (
    <PageColumns>
      <Link href="/dashboard" className="text-primary text-sm underline">
        ← Home
      </Link>
      <div className="mt-4">
        <PostCard
          post={post}
          currentUserId={actor.userId}
          canModerate={canModerate}
          expanded
          onDelete={deletePostAndGoHomeAction}
          onReact={reactAction}
          onUnreact={unreactAction}
          onReport={reportContentAction}
          onResolve={resolveReportAction}
          onDismiss={dismissReportAction}
        />
      </div>
      <h2 className="mt-6 mb-3 text-lg font-semibold">
        Comments ({post.commentCount})
      </h2>
      <CommentThread
        postId={postId}
        comments={commentsPage.comments}
        currentUserId={actor.userId}
        onAddComment={addCommentAction}
        onDeleteComment={deleteCommentAction}
      />
    </PageColumns>
  );
}
