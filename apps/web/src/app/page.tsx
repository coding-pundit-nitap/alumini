import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  CalendarDays,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

import { buttonVariants } from "@nitap/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nitap/ui/components/card";

import { PublicShell } from "@/components/common/public-shell";
import { siteConfig } from "@/config/site";
import { getActor } from "@/modules/auth";
import { verifiedHome } from "@/lib/signed-in-redirect";

export const metadata: Metadata = {
  title: { absolute: siteConfig.name },
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    type: "website",
  },
};

const VALUES = [
  {
    title: "Directory",
    body: "Find batchmates by department, batch, company or city.",
    icon: Users,
  },
  {
    title: "Mentorship",
    body: "Ask alumni who have walked the path before you.",
    icon: GraduationCap,
  },
  {
    title: "Jobs & internships",
    body: "Openings shared by alumni and reviewed before they go live.",
    icon: Briefcase,
  },
  {
    title: "Events",
    body: "Meetups, talks and reunions, online and in your city.",
    icon: CalendarDays,
  },
];

const STEPS = [
  { title: "Register", body: "Sign up with your email." },
  {
    title: "Get verified",
    body: "The institute confirms you studied or work here.",
  },
  { title: "Connect", body: "Reach people, mentors and opportunities." },
];

/** §5.1.1. Anyone may view; signed-in visitors get "Go to dashboard" instead of Join (H-1). */
export default async function LandingPage() {
  const actor = await getActor();
  const home = verifiedHome(actor);
  if (home) redirect(home);
  const signedIn = actor !== null;
  return (
    <PublicShell signedIn={signedIn}>
      <section className="dawn-glow">
        <div className="container mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center md:py-28">
          <h1 className="font-display text-5xl tracking-tight text-balance md:text-6xl">
            Stay connected with your NIT Arunachal Pradesh community
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">
            Find batchmates and mentors, discover opportunities, and come back
            for events.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {signedIn ? (
              <Link
                href="/dashboard"
                className={buttonVariants({ size: "lg" })}
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className={buttonVariants({ size: "lg" })}
                >
                  Join the network
                </Link>
                <Link
                  href="/login"
                  className={buttonVariants({ size: "lg", variant: "outline" })}
                >
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-label="What you can do" className="bg-muted/40 py-16">
        <div className="container mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map(({ title, body, icon: Icon }) => (
            <Link
              key={title}
              href={signedIn ? "/dashboard" : "/register"}
              className="rounded-xl focus-visible:outline-2"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <Icon aria-hidden className="text-primary mb-2 size-6" />
                  <CardTitle>
                    <h3>{title}</h3>
                  </CardTitle>
                  <CardDescription>{body}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="how-it-works"
        className="container mx-auto max-w-4xl px-4 py-16"
      >
        <h2 className="mb-8 text-center text-2xl font-semibold">
          How it works
        </h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col items-center gap-2 text-center"
            >
              <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-full font-semibold">
                {i + 1}
              </span>
              <span className="font-medium">{step.title}</span>
              <span className="text-muted-foreground text-sm">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="privacy" className="bg-muted/40 py-16">
        <div className="container mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 text-center">
          <ShieldCheck aria-hidden className="text-primary size-8" />
          <h2 className="text-2xl font-semibold">A trusted network</h2>
          <p className="text-muted-foreground">
            Every member is verified by the institute. You choose who sees your
            profile, and your email, phone and roll number are never shown to
            other members.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
