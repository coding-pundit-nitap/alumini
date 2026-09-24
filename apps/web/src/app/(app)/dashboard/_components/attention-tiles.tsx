import Link from "next/link";

import { Card, CardHeader, CardTitle } from "@nitap/ui/components/card";

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
    <section aria-labelledby="attention" className="flex flex-col gap-3">
      <h2 id="attention" className="text-lg font-semibold">
        Needs your attention
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((tile) => {
          const n = counts[tile.key];
          return (
            <Link key={tile.key} href={tile.href}>
              <Card className="hover:bg-muted/50 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">
                    <span className="text-2xl tabular-nums">
                      {n >= COUNT_CAP ? `${COUNT_CAP}+` : n}
                    </span>{" "}
                    {n === 1 ? tile.one : tile.many}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
