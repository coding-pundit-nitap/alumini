import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@nitap/ui/components/button";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";

import { TickedAvatar } from "@nitap/ui/components/role-tick";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import type { PostAuthor } from "../../application/posts-store";

/** Avatar with photo or initials fallback — reused by PostAuthorLine and the composer's collapsed row. */
export function PostAuthorAvatar({
  author,
  size = "default",
}: {
  author: PostAuthor;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <TickedAvatar tick={author.tick} size={size === "sm" ? "sm" : "md"}>
      <InitialsAvatar
        name={author.fullName}
        seed={author.id}
        src={author.hasPhoto ? `/api/photos/${author.id}` : null}
        size={size}
      />
    </TickedAvatar>
  );
}

/** Author avatar, name, headline and a relative timestamp — the standard header for a post/comment. */
export function PostAuthorLine({
  author,
  createdAt,
  editedAt = null,
  currentUserId,
  size = "default",
  badge,
}: {
  author: PostAuthor;
  createdAt: Date;
  editedAt?: Date | null;
  currentUserId: string | null;
  size?: "sm" | "default";
  badge?: ReactNode;
}) {
  const href =
    author.id === currentUserId ? "/profile" : `/members/${author.id}`;
  const avatarSize = size === "sm" ? "default" : "lg";

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* Same destination as the name link beside it, so it stays out of the tab order and a11y tree. */}
      <Link href={href} className="shrink-0" tabIndex={-1} aria-hidden>
        <PostAuthorAvatar author={author} size={avatarSize} />
      </Link>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={href}
            className="text-foreground truncate font-semibold tracking-tight hover:underline"
          >
            {author.fullName}
          </Link>
          {badge}
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <time
            dateTime={createdAt.toISOString()}
            title={createdAt.toLocaleString()}
            suppressHydrationWarning
            className="text-muted-foreground shrink-0 text-[13px]"
          >
            {relativeTime(createdAt)}
          </time>
          {editedAt ? (
            <span
              title={`Edited ${editedAt.toLocaleString()}`}
              suppressHydrationWarning
              className="text-muted-foreground shrink-0 text-[13px]"
            >
              · edited
            </span>
          ) : null}
        </div>
        {author.headline ? (
          <div className="text-muted-foreground truncate text-[13px]">
            {author.headline}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The post page's right-rail card: who wrote this, with a way to their profile. */
export function PostAuthorCard({
  author,
  currentUserId,
}: {
  author: PostAuthor;
  currentUserId: string | null;
}) {
  const own = author.id === currentUserId;
  return (
    <section aria-label="About the author">
      <h2 className="text-[15px] font-semibold tracking-tight">
        About the author
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <PostAuthorAvatar author={author} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">
            {author.fullName}
          </p>
          <p className="text-muted-foreground truncate text-[13px]">
            {author.headline ?? "Member of the network"}
          </p>
        </div>
      </div>
      <Link
        href={own ? "/profile" : `/members/${author.id}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "mt-4 w-full rounded-full"
        )}
      >
        {own ? "View your profile" : "View profile"}
      </Link>
    </section>
  );
}
