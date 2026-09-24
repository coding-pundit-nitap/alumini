"use client";

import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

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

type WirePost = Omit<FeedPost, "createdAt"> & { createdAt: string };
type Page = { posts: FeedPost[]; nextCursor: string | null };

function revive(p: { posts: WirePost[]; nextCursor: string | null }): Page {
  return {
    ...p,
    posts: p.posts.map((post) => ({
      ...post,
      createdAt: new Date(post.createdAt),
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
  onReact,
  onUnreact,
  onReport,
  onResolve,
  onDismiss,
  basePath = "/dashboard",
}: {
  posts: FeedPost[];
  nextCursor: string | null;
  currentUserId: string | null;
  canModerate: boolean;
  onDelete: DeleteAction;
  onReact: ReactAction;
  onUnreact: UnreactAction;
  onReport: ReportAction;
  onResolve: ResolveAction;
  onDismiss: ResolveAction;
  basePath?: string;
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
  const seen = new Set<string>();
  const allPosts = pages.flatMap((page) => page.posts);
  const dedupedPosts = allPosts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  const lastCursor = pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="space-y-4">
      {dedupedPosts.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon" className="bg-brand/10 text-brand">
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>No posts yet</EmptyTitle>
          <EmptyDescription>
            No posts yet — be the first to share something.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="space-y-3">
          {dedupedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              canModerate={canModerate}
              onDelete={onDelete}
              onReact={onReact}
              onUnreact={onUnreact}
              onReport={onReport}
              onResolve={onResolve}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}

      {lastCursor ? (
        <Link
          href={`${basePath}?cursor=${encodeURIComponent(lastCursor)}`}
          className="text-primary block text-center text-sm underline"
          onClick={(event) => {
            event.preventDefault();
            void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </Link>
      ) : null}

      {query.isFetchNextPageError ? (
        <div className="text-center">
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
