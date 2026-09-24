import { ArrowLeft } from "lucide-react";
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
import { getPost, getViewerAuthor, listComments } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { CommentThread, PostAuthorCard, PostCard } from "@/modules/posts";

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

  let post, commentsPage, viewer;
  try {
    [post, commentsPage, viewer] = await Promise.all([
      getPost({ actor, postId }),
      listComments({ actor, postId }),
      getViewerAuthor(actor),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const canModerate =
    can(actor, PERMISSIONS.POST_MODERATE) ||
    can(actor, PERMISSIONS.REPORT_REVIEW);

  const comments = post.commentCount;

  return (
    <PageColumns
      header={
        <>
          <Link
            href="/dashboard"
            aria-label="Back to home"
            className="hover:bg-muted focus-visible:ring-ring -ml-2 flex size-9 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 leading-tight">
            <h1 className="font-semibold tracking-tight">Post</h1>
            <p className="text-muted-foreground truncate text-xs">
              by {post.author.fullName}
            </p>
          </div>
        </>
      }
      aside={
        <PostAuthorCard author={post.author} currentUserId={actor.userId} />
      }
    >
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
      <h2 className="bg-muted/30 flex items-baseline gap-2 border-y px-4 py-3 text-sm font-semibold sm:px-5">
        Comments
        <span className="text-muted-foreground font-normal tabular-nums">
          {comments}
        </span>
      </h2>
      <CommentThread
        postId={postId}
        comments={commentsPage.comments}
        nextCursor={commentsPage.nextCursor}
        currentUserId={actor.userId}
        viewer={viewer}
        onAddComment={addCommentAction}
        onDeleteComment={deleteCommentAction}
      />
    </PageColumns>
  );
}
