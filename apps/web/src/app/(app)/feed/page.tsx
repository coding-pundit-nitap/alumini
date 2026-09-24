import { redirect } from "next/navigation";

/** Spec U-3: Home is the feed. Keeps `cursor` so no-JS "Load more" links still page. */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  redirect(
    cursor ? `/dashboard?cursor=${encodeURIComponent(cursor)}` : "/dashboard"
  );
}
