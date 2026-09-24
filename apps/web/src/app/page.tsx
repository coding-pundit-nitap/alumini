import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EyeOff, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { PublicShell } from "@/components/common/public-shell";
import { siteConfig } from "@/config/site";
import { getActor } from "@/modules/auth";
import { verifiedHome } from "@/lib/signed-in-redirect";

import { CtaButtons } from "./_landing/cta-buttons";
import { DawnScene } from "./_landing/dawn-scene";
import { Features } from "./_landing/features";
import { SunStage } from "./_landing/sun-stage";

export const metadata: Metadata = {
  title: { absolute: siteConfig.name },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    type: "website",
  },
};

const EYEBROW =
  "font-mono text-xs tracking-[0.14em] uppercase sm:tracking-[0.2em]";

const REASSURANCE = [
  "Verified members only",
  "You control your privacy",
  "Free for the community",
];

const STEPS = [
  { title: "Register", body: "Sign up with your email." },
  {
    title: "Get verified",
    body: "The institute confirms you studied or work here.",
  },
  { title: "Connect", body: "Reach people, mentors and opportunities." },
] as const;

const TRUST = [
  { icon: ShieldCheck, term: "Accounts", detail: "Institute-verified" },
  {
    icon: SlidersHorizontal,
    term: "Your profile",
    detail: "Per-field visibility controls",
  },
  { icon: EyeOff, term: "Contact details", detail: "Never shown to members" },
];

/** §5.1.1. Anyone may view; VERIFIED visitors go to the app, other signed-in states see "Go to dashboard". */
export default async function LandingPage() {
  const actor = await getActor();
  const home = verifiedHome(actor);
  if (home) redirect(home);
  const signedIn = actor !== null;
  return (
    <PublicShell signedIn={signedIn}>
      <section className="dark bg-background text-foreground relative isolate overflow-hidden">
        <DawnScene />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-16 pb-[clamp(11rem,20vw,23rem)] text-center sm:px-8 lg:pt-20">
          <p className={`${EYEBROW} text-muted-foreground`}>
            NIT Arunachal Pradesh &middot; Alumni network
          </p>
          <h1 className="font-display mt-6 text-[clamp(3rem,8vw,6.75rem)] leading-[0.95] tracking-tight text-balance">
            Your batch, still within&nbsp;reach.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg text-balance">
            The verified network for students and alumni of NIT Arunachal
            Pradesh. Find batchmates and mentors, discover opportunities, and
            come back for events.
          </p>
          <div className="mt-9">
            <CtaButtons signedIn={signedIn} />
          </div>
          <ul className="text-muted-foreground mt-8 flex flex-wrap justify-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-wide uppercase">
            {REASSURANCE.map((r, i) => (
              <li key={r} className="flex items-center gap-3">
                {i > 0 ? (
                  <span aria-hidden className="text-brand">
                    &bull;
                  </span>
                ) : null}
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Features signedIn={signedIn} />

      <section
        id="how-it-works"
        className="bg-muted/40 border-border border-y py-24 lg:py-32"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
              How it works
            </h2>
            <p className="text-muted-foreground max-w-xs">
              Three steps from sign-up to your first conversation.
            </p>
          </div>
          <ol className="border-border mt-16 grid border-t md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="border-border flex flex-col gap-6 border-b py-10 md:border-b-0 md:border-l md:px-8 md:first:border-l-0 md:first:pl-0"
              >
                <SunStage stage={i as 0 | 1 | 2} />
                <div>
                  <p className={`${EYEBROW} text-brand`}>
                    Step {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="font-display mt-3 text-3xl tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground mt-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="privacy" className="dark bg-background text-foreground">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:py-32">
          <div>
            <h2 className={`${EYEBROW} text-brand`}>A trusted network</h2>
            <p className="font-display mt-6 text-3xl leading-[1.15] tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Every member is verified by the institute. You choose who sees
              your profile, and your email, phone and roll number are{" "}
              <span className="text-brand italic">never shown</span> to other
              members.
            </p>
          </div>
          <dl className="border-border border-t">
            {TRUST.map(({ icon: Icon, term, detail }) => (
              <div
                key={term}
                className="border-border flex items-center gap-4 border-b py-5"
              >
                <Icon aria-hidden className="text-brand size-5 shrink-0" />
                <dt className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
                  {term}
                </dt>
                <dd className="ml-auto text-right font-medium">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative isolate overflow-hidden px-4 pt-28 pb-44 text-center sm:px-8">
        <div
          aria-hidden
          className="landing-sun absolute bottom-0 left-1/2 -z-10 size-[clamp(16rem,32vw,28rem)] -translate-x-1/2 translate-y-[62%] rounded-full opacity-80"
        />
        <div
          aria-hidden
          className="bg-border absolute inset-x-0 bottom-0 h-px"
        />
        <p className={`${EYEBROW} text-muted-foreground`}>
          India&rsquo;s first light falls on Arunachal
        </p>
        <p className="font-display mx-auto mt-6 max-w-3xl text-5xl tracking-tight text-balance sm:text-6xl lg:text-7xl">
          Your batch is already here.
        </p>
        <div className="mt-10 flex justify-center">
          <CtaButtons signedIn={signedIn} />
        </div>
      </section>
    </PublicShell>
  );
}
