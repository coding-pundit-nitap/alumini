import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";

const CHIP =
  "border-border text-muted-foreground rounded-full border px-2.5 py-0.5 font-mono text-[11px]";

type Feature = { title: string; body: string; detail: ReactNode };

const FEATURES: Feature[] = [
  {
    title: "Directory",
    body: "Find batchmates by department, batch, company or city.",
    detail: (
      <div className="flex -space-x-2">
        {["AK", "RS", "TP", "MN"].map((i) => (
          <span
            key={i}
            className="bg-muted border-background flex size-8 items-center justify-center rounded-full border-2 text-[10px] font-semibold"
          >
            {i}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Mentorship",
    body: "Ask alumni who have walked the path before you.",
    detail: <span className={CHIP}>CSE &rsquo;15 &rarr; CSE &rsquo;26</span>,
  },
  {
    title: "Jobs & internships",
    body: "Openings shared by alumni and reviewed before they go live.",
    detail: (
      <span className="bg-success/10 text-success flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px]">
        <Check className="size-3" /> Reviewed
      </span>
    ),
  },
  {
    title: "Events",
    body: "Meetups, talks and reunions, online and in your city.",
    detail: (
      <span className="border-border flex flex-col items-center rounded-md border px-2.5 py-1 leading-none">
        <span className="text-brand font-mono text-[9px] tracking-widest">
          SAT
        </span>
        <span className="font-display text-xl">14</span>
      </span>
    ),
  },
  {
    title: "Messages",
    body: "Direct and group conversations with the people you know.",
    detail: (
      <span className="flex flex-col items-end gap-1">
        <span className="bg-muted rounded-full rounded-br-sm px-2.5 py-1 text-[11px]">
          Coffee this weekend?
        </span>
        <span className="bg-brand text-brand-foreground rounded-full rounded-br-sm px-2.5 py-1 text-[11px]">
          Yes!
        </span>
      </span>
    ),
  },
  {
    title: "Achievements",
    body: "Share milestones; the institute reviews them before they reach the feed.",
    detail: <span className={CHIP}>Institute-reviewed</span>,
  },
];

/** Editorial index of what members can do; every row leads to sign-up (or the app when signed in). */
export function Features({ signedIn }: { signedIn: boolean }) {
  const href = signedIn ? "/dashboard" : "/register";
  return (
    <section aria-label="What you can do" className="py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="text-brand font-mono text-xs tracking-[0.2em] uppercase">
              What you can do
            </p>
            <h2 className="font-display mt-4 text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Everything your batch needs, in one place.
            </h2>
          </div>
          <p className="text-muted-foreground max-w-md text-lg lg:justify-self-end">
            Verified once by the institute. After that, six ways back to the
            people you studied with.
          </p>
        </div>

        <ol className="border-border mt-16 border-t">
          {FEATURES.map(({ title, body, detail }, i) => (
            <li key={title} className="border-border border-b">
              <Link
                href={href}
                className="group hover:bg-muted/50 focus-visible:ring-ring -mx-4 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-6 transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.1fr)_9rem_auto] sm:py-8"
              >
                <span className="text-muted-foreground font-mono text-xs">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display group-hover:text-brand text-3xl tracking-tight transition-[color,translate] duration-300 group-hover:translate-x-1.5 sm:text-4xl">
                  {title}
                </h3>
                <ArrowUpRight
                  aria-hidden
                  className="text-muted-foreground group-hover:text-brand size-5 transition-[color,rotate] duration-300 group-hover:rotate-45 sm:order-last"
                />
                <p className="text-muted-foreground col-start-2 col-end-4 text-sm leading-relaxed sm:col-auto sm:text-base">
                  {body}
                </p>
                <div
                  aria-hidden
                  className="hidden justify-end opacity-70 transition-opacity duration-300 group-hover:opacity-100 sm:flex"
                >
                  {detail}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
