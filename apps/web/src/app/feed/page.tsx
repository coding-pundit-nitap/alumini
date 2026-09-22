import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PERMISSIONS } from "@nitap/database/permissions";

import {
  createPostAction,
  deletePostAction,
  dismissReportAction,
  presignPostImageAction,
  completePostImageAction,
  getPostImageStatusAction,
  reactAction,
  reportContentAction,
  resolveReportAction,
  unreactAction,
} from "./actions";
import { listFeed } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import { FeedList, PostComposer } from "@/modules/posts";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Ffeed");

  let page;
  try {
    page = await listFeed({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect("/feed");
    }
    throw error;
  }

  const canModerate =
    can(actor, PERMISSIONS.POST_MODERATE) ||
    can(actor, PERMISSIONS.REPORT_REVIEW);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Feed</h1>
      <PostComposer
        onSubmit={createPostAction}
        presignAction={presignPostImageAction}
        completeAction={completePostImageAction}
        statusAction={getPostImageStatusAction}
      />
      <FeedList
        posts={page.posts}
        nextCursor={page.nextCursor}
        currentUserId={actor.userId}
        canModerate={canModerate}
        onDelete={deletePostAction}
        onReact={reactAction}
        onUnreact={unreactAction}
        onReport={reportContentAction}
        onResolve={resolveReportAction}
        onDismiss={dismissReportAction}
      />
    </div>
  );
}
