import Link from "next/link";
import type { ReactNode } from "react";
import {
  Award,
  Briefcase,
  CalendarDays,
  GraduationCap,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const CHIP = "bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs";

type Tile = {
  title: string;
  body: string;
  icon: LucideIcon;
  span: string;
  extra?: ReactNode;
};

const TILES: Tile[] = [
  {
    title: "Directory",
    body: "Find batchmates by department, batch, company or city.",
    icon: Users,
    span: "lg:col-span-4",
    extra: (
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex -space-x-2">
          {["AK", "RS", "TP", "MN", "DB"].map((i) => (
            <span
              key={i}
              className="bg-muted border-card flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold"
            >
              {i}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          {["CSE", "2019", "Bengaluru"].map((c) => (
            <span key={c} className={CHIP}>
              {c}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Mentorship",
    body: "Ask alumni who have walked the path before you.",
    icon: GraduationCap,
    span: "lg:col-span-2",
  },
  {
    title: "Jobs & internships",
    body: "Openings shared by alumni and reviewed before they go live.",
    icon: Briefcase,
    span: "lg:col-span-2",
    extra: (
      <div className="mt-4 flex gap-2">
        <span className={CHIP}>Internship</span>
        <span className="bg-success/10 text-success rounded-full px-2.5 py-1 text-xs">
          Reviewed
        </span>
      </div>
    ),
  },
  {
    title: "Events",
    body: "Meetups, talks and reunions, online and in your city.",
    icon: CalendarDays,
    span: "lg:col-span-2",
    extra: (
      <div className="border-border mt-4 inline-flex flex-col items-center rounded-lg border px-3 py-1.5 leading-none">
        <span className="text-brand text-[10px] font-semibold tracking-wider">
          SAT
        </span>
        <span className="font-display text-2xl">14</span>
      </div>
    ),
  },
  {
    title: "Messages",
    body: "Direct and group conversations with the people you know.",
    icon: MessageCircle,
    span: "lg:col-span-2",
  },
  {
    title: "Achievements",
    body: "Share milestones; the institute reviews them before they reach the feed.",
    icon: Award,
    span: "sm:col-span-2 lg:col-span-6",
  },
];

export function Bento({ signedIn }: { signedIn: boolean }) {
  const href = signedIn ? "/dashboard" : "/register";
  return (
    <section aria-label="What you can do" className="py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <p className="text-brand text-sm font-medium">What you can do</p>
        <h2 className="font-display mt-2 max-w-xl text-4xl tracking-tight text-balance">
          Everything your batch needs, in one place.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {TILES.map(({ title, body, icon: Icon, span, extra }) => (
            <Link
              key={title}
              href={href}
              className={cn(
                "group bg-card border-border hover:border-brand/40 focus-visible:ring-ring rounded-2xl border p-6 transition-[border-color,transform] duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:outline-none",
                span
              )}
            >
              <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-xl">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {body}
              </p>
              {extra}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
