import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listFeed } from "@/composition/posts";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Feed" };

/**
 * Minimal proof of wiring only (Task 11): plain output, no shadcn UI. Task 13 builds the real feed.
 */
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Feed</h1>
      <ul className="space-y-4">
        {page.posts.map((post) => (
          <li key={post.id} className="border-b pb-4">
            <p>{post.content}</p>
            <Link
              href={`/feed/${post.id}`}
              className="text-primary text-sm underline"
            >
              View comments
            </Link>
          </li>
        ))}
      </ul>
      {page.nextCursor ? (
        <Link
          href={`/feed?cursor=${encodeURIComponent(page.nextCursor)}`}
          className="text-primary block text-center text-sm underline"
        >
          Next page
        </Link>
      ) : null}
    </div>
  );
}
