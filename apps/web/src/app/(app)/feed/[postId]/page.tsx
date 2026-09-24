import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { addCommentAction, deleteCommentAction } from "../actions";
import { listComments } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { CommentThread } from "@/modules/posts";

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

  let page;
  try {
    page = await listComments({ actor, postId });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <Link href="/feed" className="text-primary text-sm underline">
        Back to feed
      </Link>
      <h1 className="text-2xl font-semibold">Comments</h1>
      <CommentThread
        postId={postId}
        comments={page.comments}
        currentUserId={actor.userId}
        onAddComment={addCommentAction}
        onDeleteComment={deleteCommentAction}
      />
    </div>
  );
}
