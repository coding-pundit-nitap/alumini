"use client";

import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquareText, Pin } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nitap/ui/components/empty";

import type { ActionResult } from "@/lib/action-result";
import { fetcher } from "@/lib/fetcher";
import type { ModerationTarget } from "@/modules/moderation";

import type { FeedPost } from "../../application/posts-store";
import type { ReactionType } from "../../domain/posts";
import { PostCard } from "./post-card";

type DeleteAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;
type EditAction = (
  postId: string,
  input: { content: string }
) => Promise<ActionResult<Record<string, never>>>;
type ReactAction = (
  postId: string,
  input: { type: ReactionType }
) => Promise<ActionResult<Record<string, never>>>;
type UnreactAction = (
  postId: string
) => Promise<ActionResult<Record<string, never>>>;
type ReportAction = (input: {
  targetType: ModerationTarget;
  targetId: string;
  reason: string;
}) => Promise<ActionResult<{ reportId: string; created: boolean }>>;
type ResolveAction = (
  reportId: string,
  reason: string
) => Promise<ActionResult<Record<string, never>>>;

type WirePost = Omit<FeedPost, "createdAt" | "editedAt"> & {
  createdAt: string;
  editedAt: string | null;
};
type Page = { posts: FeedPost[]; nextCursor: string | null };

function revive(p: { posts: WirePost[]; nextCursor: string | null }): Page {
  return {
    ...p,
    posts: p.posts.map((post) => ({
      ...post,
      createdAt: new Date(post.createdAt),
      editedAt: post.editedAt ? new Date(post.editedAt) : null,
    })),
  };
}

/** The feed, as returned by `listFeed` (newest-first, C-6); a Link carries the next keyset cursor. */
export function FeedList({
  posts,
  nextCursor,
  currentUserId,
  canModerate,
  onDelete,
  onEdit,
  onReact,
  onUnreact,
  onReport,
  onResolve,
  onDismiss,
  basePath = "/dashboard",
  pinned = null,
}: {
  posts: FeedPost[];
  nextCursor: string | null;
  currentUserId: string | null;
  canModerate: boolean;
  onDelete: DeleteAction;
  onEdit?: EditAction;
  onReact: ReactAction;
  onUnreact: UnreactAction;
  onReport: ReportAction;
  onResolve: ResolveAction;
  onDismiss: ResolveAction;
  basePath?: string;
  pinned?: FeedPost | null;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["feed", currentUserId];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string }) =>
      revive(
        await fetcher(`/api/v1/posts?cursor=${encodeURIComponent(pageParam)}`)
      ),
    initialPageParam: "",
    getNextPageParam: (last: Page) => last.nextCursor ?? undefined,
    initialData: { pages: [{ posts, nextCursor }], pageParams: [""] },
    staleTime: Infinity,
  });

  // The server hands fresh page-1 props on every `refresh()`; key the cache on them
  // rather than local state, so a new post from the composer flows straight into
  // the infinite-query cache page 1 replaces.
  useEffect(() => {
    queryClient.setQueryData(queryKey, (data: typeof query.data) =>
      data
        ? { ...data, pages: [{ posts, nextCursor }, ...data.pages.slice(1)] }
        : data
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only page 1 is server-owned
  }, [posts, nextCursor]);

  const pages = query.data?.pages ?? [];
  const seen = new Set<string>(pinned ? [pinned.id] : []);
  const allPosts = pages.flatMap((page) => page.posts);
  const dedupedPosts = allPosts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  const lastCursor = pages.at(-1)?.nextCursor ?? null;
  const moreRef = useRef<HTMLAnchorElement>(null);
  const { fetchNextPage, isFetchingNextPage, isFetchNextPageError } = query;

  // Infinite scroll: fetch the next page as the "Load more" row comes within a screen of view. A failed page
  // stops the loop until "Try again"; the link stays as the keyboard / no-observer path.
  useEffect(() => {
    const el = moreRef.current;
    if (
      !el ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      { rootMargin: "0px 0px 800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lastCursor, fetchNextPage, isFetchingNextPage, isFetchNextPageError]);

  return (
    <div>
      {pinned ? (
        <section aria-label="Pinned announcement" className="border-b">
          <p className="text-muted-foreground flex items-center gap-1.5 px-4 pt-3 text-[11px] font-medium tracking-wide uppercase sm:px-5">
            <Pin aria-hidden className="size-3" />
            Pinned
          </p>
          <PostCard
            post={pinned}
            currentUserId={currentUserId}
            canModerate={canModerate}
            onDelete={onDelete}
            onEdit={onEdit}
            onReact={onReact}
            onUnreact={onUnreact}
            onReport={onReport}
            onResolve={onResolve}
            onDismiss={onDismiss}
          />
        </section>
      ) : null}

      {dedupedPosts.length === 0 && !pinned ? (
        <Empty className="py-16">
          <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>No posts yet</EmptyTitle>
          <EmptyDescription>
            No posts yet — be the first to share something.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="divide-border divide-y">
          {dedupedPosts.map((post, i) => (
            <div
              key={post.id}
              // Stagger only the first screenful; later pages just fade.
              style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
              className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500"
            >
              <PostCard
                post={post}
                currentUserId={currentUserId}
                canModerate={canModerate}
                onDelete={onDelete}
                onEdit={onEdit}
                onReact={onReact}
                onUnreact={onUnreact}
                onReport={onReport}
                onResolve={onResolve}
                onDismiss={onDismiss}
              />
            </div>
          ))}
        </div>
      )}

      {!lastCursor && dedupedPosts.length > 0 ? (
        <p className="text-muted-foreground border-border border-t py-8 text-center text-sm">
          You&apos;re all caught up.
        </p>
      ) : null}

      {lastCursor ? (
        <Link
          ref={moreRef}
          href={`${basePath}?cursor=${encodeURIComponent(lastCursor)}`}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/40 border-border block border-t py-4 text-center text-sm font-medium transition-colors"
          onClick={(event) => {
            event.preventDefault();
            void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </Link>
      ) : null}

      {query.isFetchNextPageError ? (
        <div className="py-4 text-center">
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load more posts.
          </p>
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            className="text-brand text-sm underline"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
