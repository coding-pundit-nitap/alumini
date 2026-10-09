import type { ReactNode } from "react";

import { legalConfig } from "@/config/legal";

/** Shared body for the supporting pages (Terms, Contact): title, last-updated line, draft notice, sections. */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  const updated = new Date(`${legalConfig.lastUpdated}T00:00:00Z`);
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-20">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="text-muted-foreground mt-3 text-sm">
        Last updated{" "}
        <time dateTime={legalConfig.lastUpdated}>
          {updated.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </p>
      {legalConfig.approved ? null : (
        <p
          role="note"
          className="border-brand/30 bg-brand/5 mt-6 rounded-lg border px-4 py-3 text-sm"
        >
          This page is a draft awaiting approval by NIT Arunachal Pradesh. The
          approved text will replace it.
        </p>
      )}
      <div className="text-muted-foreground mt-8 text-[15px] leading-relaxed">
        {intro}
      </div>
      <div className="mt-10 space-y-10">{children}</div>
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-foreground text-xl font-semibold">
        {title}
      </h2>
      <div className="text-muted-foreground [&_a]:text-foreground space-y-3 text-[15px] leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
