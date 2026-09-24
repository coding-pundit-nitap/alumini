import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, EyeOff, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { DawnMark } from "@/components/brand/dawn-mark";
import { PublicShell } from "@/components/common/public-shell";
import { siteConfig } from "@/config/site";
import { getActor } from "@/modules/auth";
import { verifiedHome } from "@/lib/signed-in-redirect";

import { Bento } from "./_landing/bento";
import { CtaButtons } from "./_landing/cta-buttons";
import { ScrollPreview } from "./_landing/scroll-preview";

export const metadata: Metadata = {
  title: { absolute: siteConfig.name },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    type: "website",
  },
};

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
];

const TRUST = [
  { icon: ShieldCheck, label: "Institute-verified accounts" },
  { icon: SlidersHorizontal, label: "Per-field visibility controls" },
  { icon: EyeOff, label: "Contact details never shown" },
];

/** §5.1.1. Anyone may view; VERIFIED visitors go to the app, other signed-in states see "Go to dashboard". */
export default async function LandingPage() {
  const actor = await getActor();
  const home = verifiedHome(actor);
  if (home) redirect(home);
  const signedIn = actor !== null;
  return (
    <PublicShell signedIn={signedIn}>
      <section className="dawn-glow relative overflow-hidden">
        <div aria-hidden className="dot-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-16 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-24 lg:pb-28">
          <div className="flex flex-col items-start gap-6">
            <span className="bg-card/70 border-border flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-xs font-medium backdrop-blur">
              <DawnMark className="size-5" />
              For NIT Arunachal Pradesh students &amp; alumni
            </span>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Stay connected with your NIT Arunachal Pradesh{" "}
              <em className="text-brand">community</em>
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg">
              Find batchmates and mentors, discover opportunities, and come back
              for events.
            </p>
            <CtaButtons signedIn={signedIn} />
            <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {REASSURANCE.map((r) => (
                <li key={r} className="flex items-center gap-1.5">
                  <Check aria-hidden className="text-success size-4" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <ScrollPreview />
        </div>
      </section>

      <Bento signedIn={signedIn} />

      <section id="how-it-works" className="border-border border-y py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <h2 className="font-display text-4xl tracking-tight">How it works</h2>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            <span
              aria-hidden
              className="bg-border absolute top-5 bottom-5 left-5 w-px md:top-5 md:right-[16%] md:bottom-auto md:left-[16%] md:h-px md:w-auto"
            />
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="relative flex gap-5 md:flex-col md:items-center md:text-center"
              >
                <span className="bg-background border-brand text-brand font-display relative flex size-10 shrink-0 items-center justify-center rounded-full border text-xl">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold">{step.title}</div>
                  <div className="text-muted-foreground mt-1 text-sm">
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="privacy"
        className="dark bg-background text-foreground relative overflow-hidden"
      >
        <div aria-hidden className="dawn-glow absolute inset-0 -scale-y-100" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <ShieldCheck aria-hidden className="text-brand size-8" />
            <h2 className="font-display text-4xl tracking-tight">
              A trusted network
            </h2>
            <p className="text-muted-foreground max-w-lg">
              Every member is verified by the institute. You choose who sees
              your profile, and your email, phone and roll number are never
              shown to other members.
            </p>
          </div>
          <ul className="grid gap-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="bg-card border-border flex items-center gap-3 rounded-xl border px-4 py-3"
              >
                <Icon aria-hidden className="text-brand size-5" />
                <span className="text-sm font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-8">
        <div className="dawn-glow bg-card border-border mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-3xl border px-6 py-16 text-center">
          <DawnMark className="size-10" />
          <p className="font-display text-4xl tracking-tight text-balance sm:text-5xl">
            Your batch is already here.
          </p>
          <CtaButtons signedIn={signedIn} />
        </div>
      </section>
    </PublicShell>
  );
}
