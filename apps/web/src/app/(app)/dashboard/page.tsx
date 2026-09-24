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
} from "@/app/(app)/feed/actions";
import { PageColumns } from "@/components/shell/page-columns";
import { listFeed } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { FeedList, PostComposer } from "@/modules/posts";

import { BlockSkeleton } from "./_components/block-skeleton";
import {
  composerAuthor,
  FirstRun,
  Greeting,
  Widgets,
  WidgetStrip,
} from "./_components/data";

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
  const author = canPost ? await composerAuthor(actor) : undefined;

  return (
    <PageColumns aside={<Widgets actor={actor} />}>
      <Suspense fallback={<BlockSkeleton rows={1} />}>
        <Greeting actor={actor} />
      </Suspense>
      <nav
        aria-label="Home sections"
        className="bg-background/85 sticky top-0 z-10 -mx-4 mb-4 flex gap-6 border-b px-4 backdrop-blur lg:-mx-8 lg:px-8"
      >
        <Link
          href="/dashboard"
          aria-current="page"
          className="border-brand border-b-2 py-3 text-sm font-medium"
        >
          For you
        </Link>
        <Link
          href="/directory"
          className="text-muted-foreground hover:text-foreground py-3 text-sm"
        >
          People
        </Link>
      </nav>
      <div className="mb-4 xl:hidden">
        <WidgetStrip actor={actor} />
      </div>
      <Suspense fallback={null}>
        <FirstRun actor={actor} />
      </Suspense>
      {canPost ? (
        <div className="mb-4">
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
        onReact={reactAction}
        onUnreact={unreactAction}
        onReport={reportContentAction}
        onResolve={resolveReportAction}
        onDismiss={dismissReportAction}
      />
    </PageColumns>
  );
}
