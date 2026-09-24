import Link from "next/link";

import { Block } from "./lists";

export type AttentionCounts = {
  connectionRequests: number;
  unreadMessages: number;
  mentorshipRequests: number;
  unreadNotifications: number;
};

/** Each source is read with limit 50 (H-8); at the cap the exact number is unknown. */
export const COUNT_CAP = 50;

const TILES: {
  key: keyof AttentionCounts;
  one: string;
  many: string;
  href: string;
}[] = [
  {
    key: "connectionRequests",
    one: "connection request",
    many: "connection requests",
    href: "/connections?tab=incoming",
  },
  {
    key: "unreadMessages",
    one: "unread message",
    many: "unread messages",
    href: "/messages",
  },
  {
    key: "mentorshipRequests",
    one: "mentorship request",
    many: "mentorship requests",
    href: "/mentorship?tab=requests",
  },
  {
    key: "unreadNotifications",
    one: "unread notification",
    many: "unread notifications",
    href: "/notifications",
  },
];

/** §5.3.1 "Needs your attention": zero tiles hide; nothing to do → no block at all. */
export function AttentionTiles({ counts }: { counts: AttentionCounts }) {
  const shown = TILES.filter((tile) => counts[tile.key] > 0);
  if (shown.length === 0) return null;
  return (
    <Block title="Needs your attention">
      <div className="mt-2 grid grid-cols-2 gap-2">
        {shown.map((tile) => {
          const n = counts[tile.key];
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="hover:bg-muted/60 rounded-lg border px-3 py-2 transition-colors"
            >
              <span className="font-display text-brand block text-2xl leading-none tabular-nums">
                {n >= COUNT_CAP ? `${COUNT_CAP}+` : n}
              </span>{" "}
              <span className="text-muted-foreground mt-1 block text-xs">
                {n === 1 ? tile.one : tile.many}
              </span>
            </Link>
          );
        })}
      </div>
    </Block>
  );
}
