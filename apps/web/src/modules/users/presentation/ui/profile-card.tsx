import {
  ArrowUpRight,
  CodeXml,
  Globe,
  GraduationCap,
  Link2,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";

import { TickedAvatar } from "@nitap/ui/components/role-tick";
import type { Tick } from "@/lib/role-tick";

import type { ProfileView } from "../../domain/profile";
import { duration, hostPath, LINK_LABEL, monthYear } from "./format";
import { ItemTile } from "./item-tile";

/** A small mark per link type (the icon set has no brand logos). */
function LinkMark({ type }: { type: string }) {
  if (type === "LINKEDIN")
    return (
      <span aria-hidden className="text-[11px] leading-none font-bold">
        in
      </span>
    );
  if (type === "TWITTER")
    return (
      <span aria-hidden className="text-xs leading-none font-bold">
        𝕏
      </span>
    );
  const Icon = type === "GITHUB" ? CodeXml : type === "WEBSITE" ? Globe : Link2;
  return <Icon aria-hidden className="size-3.5" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t px-4 py-6 sm:px-6">
      <h2 className="mb-4 text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Low-poly ridges over a dawn wash, echoing the landing and the DawnMark. Decorative. */
function Cover() {
  return (
    <div
      aria-hidden
      className="relative h-28 overflow-hidden sm:h-40"
      style={{
        background:
          "radial-gradient(60% 120% at 70% 110%, color-mix(in oklch, var(--brand) 55%, transparent), transparent 70%), linear-gradient(135deg, color-mix(in oklch, var(--chart-5) 35%, var(--background)), color-mix(in oklch, var(--brand) 25%, var(--background)))",
      }}
    >
      <svg
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-3/5 w-full"
      >
        <path
          d="M0 110L120 70 210 95 330 40 440 85 560 55 680 100 800 45 930 90 1050 60 1200 95V160H0Z"
          style={{
            fill: "color-mix(in oklch, var(--foreground) 10%, transparent)",
          }}
        />
        <path
          d="M0 140L150 110 280 130 420 95 560 135 700 105 850 140 1000 110 1200 130V160H0Z"
          style={{ fill: "var(--background)" }}
        />
      </svg>
    </div>
  );
}

/** Renders only the keys visibility left in the view. */
export function ProfileCard({
  view,
  actions,
  tick = null,
  tickHref,
}: {
  view: ProfileView;
  actions?: ReactNode;
  /** The seal on the photo and beside the name. */
  tick?: Tick | null;
  /** Your own profile: where to change which tick shows. */
  tickHref?: string;
}) {
  const { institution, experience, education, skills, links } = view;
  const schooling =
    institution &&
    (institution.department || institution.degree || institution.graduationYear)
      ? institution
      : null;

  return (
    <article>
      <Cover />
      <header className="px-4 pb-6 sm:px-6">
        <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
          <TickedAvatar tick={tick} size="lg">
            {view.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
              <img
                src={view.photoUrl}
                alt={view.fullName}
                className="ring-background bg-muted size-24 rounded-full object-cover ring-4 sm:size-28"
              />
            ) : (
              <InitialsAvatar
                name={view.fullName}
                seed={view.userId}
                className="ring-background bg-background size-24 ring-4 sm:size-28 [&_[data-slot=avatar-fallback]]:text-3xl"
              />
            )}
          </TickedAvatar>
          {actions ? (
            <div className="flex flex-wrap justify-end gap-2 pb-1">
              {actions}
            </div>
          ) : null}
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {view.fullName}
        </h1>
        {tick ? (
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <span aria-hidden>{tick.label}</span>
            {tickHref ? (
              <Link
                href={tickHref}
                className="text-brand text-xs font-medium underline-offset-2 hover:underline"
              >
                Change tick
              </Link>
            ) : null}
          </p>
        ) : null}
        {view.headline ? (
          <p className="text-foreground/90 mt-1 text-[15px] leading-snug">
            {view.headline}
          </p>
        ) : null}
        {view.location || schooling ? (
          <ul className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {view.location ? (
              <li className="flex items-center gap-1.5">
                <MapPin aria-hidden className="size-4" />
                <span>{view.location}</span>
              </li>
            ) : null}
            {schooling ? (
              <li className="flex items-center gap-1.5">
                <GraduationCap aria-hidden className="size-4" />
                {schooling.degree || schooling.department ? (
                  <span>
                    {[schooling.degree, schooling.department]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                ) : null}
                {schooling.graduationYear ? (
                  <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-xs font-medium">
                    Batch of {schooling.graduationYear}
                  </span>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : null}
      </header>

      {!view.bio &&
      !experience?.length &&
      !education?.length &&
      !skills?.length &&
      !links?.length ? (
        // Empty and privacy-hidden look the same from here, so the note claims neither.
        <p className="text-muted-foreground border-t px-4 py-10 text-center text-sm sm:px-6">
          Nothing more to show here yet.
        </p>
      ) : null}

      {view.bio ? (
        <Section title="About">
          <p className="text-[15px] leading-relaxed whitespace-pre-line">
            {view.bio}
          </p>
        </Section>
      ) : null}

      {experience && experience.length > 0 ? (
        <Section title="Experience">
          <ol className="space-y-5">
            {experience.map((item) => (
              <li
                key={`${item.company}:${item.designation}:${item.startDate}`}
                className="flex gap-3.5"
              >
                <ItemTile name={item.company} />
                <div className="min-w-0 text-sm">
                  <p className="text-[15px] font-semibold">
                    {item.designation}
                  </p>
                  <p>
                    {item.company}
                    {item.industry ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.industry}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {monthYear(item.startDate)} –{" "}
                    {item.isCurrent ? (
                      <span className="text-success font-medium">Present</span>
                    ) : item.endDate ? (
                      monthYear(item.endDate)
                    ) : (
                      ""
                    )}
                    {(item.isCurrent || item.endDate) &&
                    duration(item.startDate, item.endDate) ? (
                      <span>
                        {" · "}
                        {duration(item.startDate, item.endDate)}
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {education && education.length > 0 ? (
        <Section title="Education">
          <ol className="space-y-5">
            {education.map((item) => (
              <li
                key={`${item.institution}:${item.qualification}:${item.startYear}`}
                className="flex gap-3.5"
              >
                <ItemTile name={item.institution} />
                <div className="min-w-0 text-sm">
                  <p className="text-[15px] font-semibold">
                    {item.institution}
                  </p>
                  <p>
                    {item.qualification}
                    {item.fieldOfStudy ? `, ${item.fieldOfStudy}` : ""}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {item.startYear} – {item.endYear ?? "present"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {skills && skills.length > 0 ? (
        <Section title="Skills">
          <ul className="flex flex-wrap gap-2">
            {skills.map((item) => (
              <li
                key={item.skill}
                className="bg-muted/70 rounded-full border px-3 py-1 text-sm font-medium"
              >
                {item.skill}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {links && links.length > 0 ? (
        <Section title="Links">
          <ul className="flex flex-wrap gap-2">
            {links.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  rel="nofollow noopener ugc"
                  target="_blank"
                  className="hover:bg-muted/60 group/link flex max-w-full items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-sm transition-colors duration-150"
                >
                  <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
                    <LinkMark type={item.type} />
                  </span>
                  <span className="font-medium">
                    {LINK_LABEL[item.type] ?? item.type}
                  </span>
                  <span className="text-muted-foreground min-w-0 truncate">
                    {hostPath(item.url)}
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                  />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}
