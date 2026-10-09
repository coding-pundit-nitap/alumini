import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  completePostImageAction,
  createPostAction,
  deletePostAction,
  dismissReportAction,
  getPostImageStatusAction,
  presignPostImageAction,
  reactAction,
  reportContentAction,
  resolveReportAction,
  unreactAction,
  updatePostAction,
} from "@/app/(app)/feed/actions";
import {
  Segmented,
  segmentedItemVariants,
} from "@nitap/ui/components/segmented";

import { PageColumns } from "@/components/shell/page-columns";
import {
  getPinnedAnnouncement,
  getViewerAuthor,
  listFeed,
} from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { FeedList, PostComposer } from "@/modules/posts";

import { BlockSkeleton } from "./_components/block-skeleton";
import { FirstRun, Greeting, Widgets, WidgetStrip } from "./_components/data";

export const metadata: Metadata = { title: "Home" };

/** Spec U-3: Home is the feed, with the §5.3.1 blocks as a highlights rail. Access per H-4. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fdashboard");
  if (actor.accountState !== "VERIFIED") {
    redirect(
      actor.accountState === "PENDING" || actor.accountState === "REJECTED"
        ? "/onboarding"
        : "/account/status"
    );
  }
  const { cursor } = await searchParams;

  let page;
  try {
    page = await listFeed({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect("/dashboard");
    }
    throw error;
  }

  const canModerate =
    can(actor, PERMISSIONS.POST_MODERATE) ||
    can(actor, PERMISSIONS.REPORT_REVIEW);
  const canPost = can(actor, PERMISSIONS.POST_CREATE);
  const author = canPost ? await getViewerAuthor(actor) : undefined;

  // The pinned slot is a nicety: a failure hides it, never the feed (SRS §44).
  const pinned = cursor
    ? null
    : await getPinnedAnnouncement({ actor }).catch(() => null);

  return (
    <PageColumns
      header={
        <>
          <Suspense fallback={<BlockSkeleton rows={1} />}>
            <Greeting actor={actor} />
          </Suspense>
          <nav aria-label="Home sections" className="ml-auto">
            <Segmented>
              <Link
                href="/dashboard"
                aria-current="page"
                className={segmentedItemVariants({ active: true })}
              >
                For you
              </Link>
              <Link
                href="/directory"
                className={segmentedItemVariants({ active: false })}
              >
                People
              </Link>
            </Segmented>
          </nav>
        </>
      }
      aside={<Widgets actor={actor} />}
    >
      <div className="border-b px-4 py-4 empty:hidden sm:px-5 xl:hidden">
        <WidgetStrip actor={actor} />
      </div>
      <Suspense fallback={null}>
        <div className="px-4 pt-4 empty:hidden sm:px-5">
          <FirstRun actor={actor} />
        </div>
      </Suspense>
      {canPost ? (
        <div className="border-b px-4 py-3 sm:px-5">
          <PostComposer
            onSubmit={createPostAction}
            presignAction={presignPostImageAction}
            completeAction={completePostImageAction}
            statusAction={getPostImageStatusAction}
            author={author}
          />
        </div>
      ) : null}
      <FeedList
        posts={page.posts}
        nextCursor={page.nextCursor}
        currentUserId={actor.userId}
        canModerate={canModerate}
        onDelete={deletePostAction}
        onEdit={updatePostAction}
        onReact={reactAction}
        onUnreact={unreactAction}
        onReport={reportContentAction}
        onResolve={resolveReportAction}
        onDismiss={dismissReportAction}
        pinned={pinned}
      />
    </PageColumns>
  );
}
