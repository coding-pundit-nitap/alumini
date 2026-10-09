import {
  ArrowLeft,
  BriefcaseBusiness,
  GraduationCap,
  Link2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PageColumns } from "@/components/shell/page-columns";
import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import {
  DetailItemRow,
  duration,
  EducationForm,
  ExperienceForm,
  hostPath,
  ItemTile,
  LINK_LABEL,
  LinkForm,
  monthYear,
  SkillForm,
} from "@/modules/users";
import type {
  EducationItem,
  ExperienceItem,
  LinkItem,
  SkillItem,
} from "@/modules/users";

import {
  addEducationAction,
  addExperienceAction,
  addLinkAction,
  addSkillAction,
  removeEducationAction,
  removeExperienceAction,
  removeLinkAction,
  removeSkillAction,
  updateEducationAction,
  updateExperienceAction,
  updateLinkAction,
  updateSkillAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Experience, education, skills & links",
};

type Editing = { collection: string; id: string } | null;

function parseEditing(raw: string | undefined): Editing {
  if (!raw) return null;
  const [collection, id] = raw.split(":");
  return collection && id ? { collection, id } : null;
}

const editHref = (collection: string, id: string) =>
  `/profile/details?edit=${collection}:${id}#${collection}`;

const SECTIONS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: "experience", title: "Experience", icon: BriefcaseBusiness },
  { id: "education", title: "Education", icon: GraduationCap },
  { id: "skills", title: "Skills", icon: Sparkles },
  { id: "links", title: "Links", icon: Link2 },
];

function Section({
  id,
  count,
  addTitle,
  add,
  children,
}: {
  id: string;
  count: number;
  addTitle: string;
  add: ReactNode;
  children: ReactNode;
}) {
  const { title, icon: Icon } = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={id} className="scroll-mt-28 border-b px-4 py-6 sm:px-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Icon aria-hidden className="text-brand size-[18px]" />
        {title}
        <span className="text-muted-foreground text-sm font-normal tabular-nums">
          {count}
        </span>
      </h2>
      {count > 0 ? <ul className="mt-3">{children}</ul> : null}
      <div className="bg-muted/20 mt-4 rounded-2xl border border-dashed p-4">
        <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          {addTitle}
        </h3>
        {add}
      </div>
    </section>
  );
}

/**
 * The row being edited: its form in a highlighted card, with a way back to the
 * list.
 */
function EditCard({
  section,
  children,
}: {
  section: string;
  children: ReactNode;
}) {
  return (
    <li className="border-brand/40 bg-brand/5 -mx-2 my-2 rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-brand text-xs font-semibold tracking-wide uppercase">
          Editing
        </p>
        <Link
          href={`/profile/details#${section}`}
          className="text-muted-foreground hover:text-foreground text-xs font-medium"
        >
          Cancel
        </Link>
      </div>
      {children}
    </li>
  );
}

export default async function ProfileDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fprofile%2Fdetails");
  if (
    actor.accountState === "SUSPENDED" ||
    actor.accountState === "DEACTIVATED"
  ) {
    redirect("/account/status");
  }

  const editing = parseEditing((await searchParams).edit);
  const profile = await getOwnProfile({ actor });

  return (
    <PageColumns
      header={
        <>
          <Link
            href="/profile"
            aria-label="Back to your profile"
            className="hover:bg-muted focus-visible:ring-ring -ml-2 flex size-9 items-center justify-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-2"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Experience, education, skills & links
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Shown on your profile, following your privacy settings
            </p>
          </div>
        </>
      }
    >
      <nav
        aria-label="Sections"
        className="flex scrollbar-none gap-2 overflow-x-auto border-b px-4 py-3 sm:px-5"
      >
        {SECTIONS.map(({ id, title, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="hover:bg-muted text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
          >
            <Icon aria-hidden className="size-3.5" />
            {title}
          </a>
        ))}
      </nav>

      <Section
        id="experience"
        count={profile.experience.length}
        addTitle="Add experience"
        add={<ExperienceForm action={addExperienceAction} />}
      >
        {profile.experience.map((item: ExperienceItem) =>
          editing?.collection === "experience" && editing.id === item.id ? (
            <EditCard key={item.id} section="experience">
              <ExperienceForm
                action={updateExperienceAction}
                id={item.id}
                defaults={item}
              />
            </EditCard>
          ) : (
            <DetailItemRow
              key={item.id}
              id={item.id}
              leading={<ItemTile name={item.company} className="size-10" />}
              summary={`${item.designation} · ${item.company}`}
              detail={`${monthYear(item.startDate)} – ${
                item.isCurrent
                  ? "Present"
                  : item.endDate
                    ? monthYear(item.endDate)
                    : ""
              }${
                duration(item.startDate, item.endDate)
                  ? ` · ${duration(item.startDate, item.endDate)}`
                  : ""
              }`}
              editHref={editHref("experience", item.id)}
              removeAction={removeExperienceAction}
            />
          )
        )}
      </Section>

      <Section
        id="education"
        count={profile.education.length}
        addTitle="Add education"
        add={<EducationForm action={addEducationAction} />}
      >
        {profile.education.map((item: EducationItem) =>
          editing?.collection === "education" && editing.id === item.id ? (
            <EditCard key={item.id} section="education">
              <EducationForm
                action={updateEducationAction}
                id={item.id}
                defaults={item}
              />
            </EditCard>
          ) : (
            <DetailItemRow
              key={item.id}
              id={item.id}
              leading={<ItemTile name={item.institution} className="size-10" />}
              summary={item.institution}
              detail={`${item.qualification}${
                item.fieldOfStudy ? `, ${item.fieldOfStudy}` : ""
              } · ${item.startYear}–${item.endYear ?? "present"}`}
              editHref={editHref("education", item.id)}
              removeAction={removeEducationAction}
            />
          )
        )}
      </Section>

      <Section
        id="skills"
        count={profile.skills.length}
        addTitle="New skill"
        add={<SkillForm action={addSkillAction} />}
      >
        {profile.skills.map((item: SkillItem) =>
          editing?.collection === "skills" && editing.id === item.id ? (
            <EditCard key={item.id} section="skills">
              <SkillForm
                action={updateSkillAction}
                id={item.id}
                defaults={item}
              />
            </EditCard>
          ) : (
            <DetailItemRow
              key={item.id}
              id={item.id}
              leading={
                <Sparkles
                  aria-hidden
                  className="text-muted-foreground mx-3 size-4 shrink-0"
                />
              }
              summary={item.skill}
              editHref={editHref("skills", item.id)}
              removeAction={removeSkillAction}
            />
          )
        )}
      </Section>

      <Section
        id="links"
        count={profile.links.length}
        addTitle="New link"
        add={<LinkForm action={addLinkAction} />}
      >
        {profile.links.map((item: LinkItem) =>
          editing?.collection === "links" && editing.id === item.id ? (
            <EditCard key={item.id} section="links">
              <LinkForm
                action={updateLinkAction}
                id={item.id}
                defaults={item}
              />
            </EditCard>
          ) : (
            <DetailItemRow
              key={item.id}
              id={item.id}
              leading={
                <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <Link2 aria-hidden className="size-4" />
                </span>
              }
              summary={item.url}
              detail={`${LINK_LABEL[item.type] ?? item.type} · ${hostPath(item.url)}`}
              editHref={editHref("links", item.id)}
              removeAction={removeLinkAction}
            />
          )
        )}
      </Section>
    </PageColumns>
  );
}
