import {
  Bell,
  Briefcase,
  CalendarDays,
  Heart,
  Home,
  MessageCircle,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const RAIL = [Home, Users, MessageCircle, Briefcase, CalendarDays, Bell];

const POSTS = [
  {
    initials: "EC",
    name: "A batchmate from ECE '19",
    headline: "Software engineer",
    time: "2h",
    body: "Our team is hiring two interns this winter — happy to refer juniors. Drop me a message with your resume.",
    reactions: 24,
    comments: 8,
    ribbon: null,
  },
  {
    initials: "CS",
    name: "A mentor from CSE '15",
    headline: "Engineering manager",
    time: "5h",
    body: "Office hours this Saturday for anyone preparing for placements. Bring your questions.",
    reactions: 41,
    comments: 12,
    ribbon: "Event",
  },
] as const;

/**
 * Static, decorative miniature of the member home (spec L-1). Not the real PostCard:
 * that one is a client component bound to data and actions.
 */
export function ScrollPreview() {
  return (
    <div
      aria-hidden="true"
      className="relative select-none lg:[perspective:1600px]"
    >
      <div className="bg-card border-border relative overflow-hidden rounded-2xl border shadow-[0_1px_0_0_var(--border),0_24px_60px_-20px_color-mix(in_oklch,var(--foreground)_25%,transparent)] lg:[transform:rotateX(8deg)_rotateY(-12deg)]">
        <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted text-muted-foreground ml-3 rounded-md px-3 py-0.5 font-mono text-[11px]">
            alumni/home
          </span>
        </div>
        <div className="grid grid-cols-[44px_1fr] lg:grid-cols-[44px_1fr_150px]">
          <div className="border-border flex flex-col items-center gap-4 border-r py-4">
            {RAIL.map((Icon, i) => (
              <Icon
                key={i}
                className={cn(
                  "size-4",
                  i === 0 ? "text-brand" : "text-muted-foreground/60"
                )}
              />
            ))}
          </div>
          <div className="bg-background/60 space-y-3 p-3">
            <div className="bg-card border-border text-muted-foreground rounded-xl border px-3 py-2.5 text-xs">
              Share something with your batchmates…
            </div>
            {POSTS.map((p) => (
              <div
                key={p.name}
                className="bg-card border-border rounded-xl border p-3"
              >
                <div className="flex items-start gap-2.5">
                  <span className="bg-brand/15 text-brand flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                    {p.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="text-muted-foreground">· {p.time}</span>
                      {p.ribbon ? (
                        <span className="bg-brand/10 text-brand ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium">
                          {p.ribbon}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      {p.headline}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed">{p.body}</p>
                <div className="text-muted-foreground mt-2.5 flex gap-4 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Heart className="fill-brand text-brand size-3.5" />{" "}
                    {p.reactions}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="size-3.5" /> {p.comments}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-border hidden space-y-3 border-l p-3 lg:block">
            <div className="border-border rounded-xl border p-3 text-center">
              <div
                className="mx-auto size-12 rounded-full p-1"
                style={{
                  background:
                    "conic-gradient(var(--brand) 80%, var(--muted) 0)",
                }}
              >
                <div className="bg-card flex size-full items-center justify-center rounded-full text-[11px] font-semibold">
                  80%
                </div>
              </div>
              <div className="text-muted-foreground mt-2 text-[10px]">
                Profile complete
              </div>
            </div>
            <div className="border-border space-y-2 rounded-xl border p-3">
              <div className="text-[10px] font-semibold">Upcoming</div>
              <div className="bg-muted h-2 w-4/5 rounded" />
              <div className="bg-muted h-2 w-3/5 rounded" />
            </div>
          </div>
        </div>
      </div>
      <div className="bg-card border-border animate-float absolute -bottom-4 left-4 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-lg lg:-left-8">
        <span className="bg-success size-2 rounded-full" />
        New connection request
      </div>
    </div>
  );
}
