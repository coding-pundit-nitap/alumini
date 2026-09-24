import Link from "next/link";
import type { ReactNode } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@nitap/ui/components/avatar";

import { relativeTime } from "@/lib/relative-time";

import type { PostAuthor } from "../../application/posts-store";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Author avatar, name, headline and a relative timestamp — the standard header for a post/comment. */
export function PostAuthorLine({
  author,
  createdAt,
  currentUserId,
  size = "default",
  badge,
}: {
  author: PostAuthor;
  createdAt: Date;
  currentUserId: string | null;
  size?: "sm" | "default";
  badge?: ReactNode;
}) {
  const href =
    author.id === currentUserId ? "/profile" : `/members/${author.id}`;
  const avatarSize = size === "sm" ? "sm" : "default";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Link href={href} className="shrink-0">
        <Avatar size={avatarSize}>
          {author.hasPhoto && (
            <AvatarImage src={`/api/photos/${author.id}`} alt="" />
          )}
          <AvatarFallback>{initials(author.fullName)}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={href}
            className="text-foreground truncate font-medium hover:underline"
          >
            {author.fullName}
          </Link>
          {badge}
        </div>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1 truncate text-sm">
          {author.headline ? (
            <span className="truncate">{author.headline}</span>
          ) : null}
          {author.headline ? <span aria-hidden>·</span> : null}
          <time
            dateTime={createdAt.toISOString()}
            title={createdAt.toLocaleString()}
            suppressHydrationWarning
          >
            {relativeTime(createdAt)}
          </time>
        </div>
      </div>
    </div>
  );
}
