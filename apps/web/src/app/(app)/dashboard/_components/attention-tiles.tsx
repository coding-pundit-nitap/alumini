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
      <ul className="-mx-2 flex flex-col">
        {shown.map((tile) => {
          const n = counts[tile.key];
          return (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150"
              >
                <span className="bg-brand text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                  {n >= COUNT_CAP ? `${COUNT_CAP}+` : n}
                </span>{" "}
                <span className="text-muted-foreground">
                  {n === 1 ? tile.one : tile.many}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}
