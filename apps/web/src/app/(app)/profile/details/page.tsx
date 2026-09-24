import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/composition/users";
import { getActor } from "@/modules/auth";
import {
  DetailItemRow,
  EducationForm,
  ExperienceForm,
  LinkForm,
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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const monthYear = (isoDate: string) => {
  const [year, month] = isoDate.split("-");
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${year}` : isoDate;
};

type Editing = { collection: string; id: string } | null;

function parseEditing(raw: string | undefined): Editing {
  if (!raw) return null;
  const [collection, id] = raw.split(":");
  return collection && id ? { collection, id } : null;
}

const editHref = (collection: string, id: string) =>
  `/profile/details?edit=${collection}:${id}#${collection}`;

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
    <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">
          Experience, education, skills & links
        </h1>
        <Link href="/profile" className="text-sm underline">
          Back to your profile
        </Link>
      </div>

      <section id="experience" className="space-y-4">
        <h2 className="text-lg font-medium">Experience</h2>
        <ul>
          {profile.experience.map((item: ExperienceItem) =>
            editing?.collection === "experience" && editing.id === item.id ? (
              <li key={item.id} className="border-border border-b py-3">
                <ExperienceForm
                  action={updateExperienceAction}
                  id={item.id}
                  defaults={item}
                />
              </li>
            ) : (
              <DetailItemRow
                key={item.id}
                id={item.id}
                summary={`${item.designation} · ${item.company}`}
                detail={`${monthYear(item.startDate)} – ${
                  item.isCurrent
                    ? "Present"
                    : item.endDate
                      ? monthYear(item.endDate)
                      : ""
                }`}
                editHref={editHref("experience", item.id)}
                removeAction={removeExperienceAction}
              />
            )
          )}
        </ul>
        <ExperienceForm action={addExperienceAction} />
      </section>

      <section id="education" className="space-y-4">
        <h2 className="text-lg font-medium">Education</h2>
        <ul>
          {profile.education.map((item: EducationItem) =>
            editing?.collection === "education" && editing.id === item.id ? (
              <li key={item.id} className="border-border border-b py-3">
                <EducationForm
                  action={updateEducationAction}
                  id={item.id}
                  defaults={item}
                />
              </li>
            ) : (
              <DetailItemRow
                key={item.id}
                id={item.id}
                summary={item.institution}
                detail={`${item.qualification}${
                  item.fieldOfStudy ? `, ${item.fieldOfStudy}` : ""
                } · ${item.startYear}–${item.endYear ?? "present"}`}
                editHref={editHref("education", item.id)}
                removeAction={removeEducationAction}
              />
            )
          )}
        </ul>
        <EducationForm action={addEducationAction} />
      </section>

      <section id="skills" className="space-y-4">
        <h2 className="text-lg font-medium">Skills</h2>
        <ul>
          {profile.skills.map((item: SkillItem) =>
            editing?.collection === "skills" && editing.id === item.id ? (
              <li key={item.id} className="border-border border-b py-3">
                <SkillForm
                  action={updateSkillAction}
                  id={item.id}
                  defaults={item}
                />
              </li>
            ) : (
              <DetailItemRow
                key={item.id}
                id={item.id}
                summary={item.skill}
                editHref={editHref("skills", item.id)}
                removeAction={removeSkillAction}
              />
            )
          )}
        </ul>
        <SkillForm action={addSkillAction} />
      </section>

      <section id="links" className="space-y-4">
        <h2 className="text-lg font-medium">Links</h2>
        <ul>
          {profile.links.map((item: LinkItem) =>
            editing?.collection === "links" && editing.id === item.id ? (
              <li key={item.id} className="border-border border-b py-3">
                <LinkForm
                  action={updateLinkAction}
                  id={item.id}
                  defaults={item}
                />
              </li>
            ) : (
              <DetailItemRow
                key={item.id}
                id={item.id}
                summary={item.url}
                detail={item.type}
                editHref={editHref("links", item.id)}
                removeAction={removeLinkAction}
              />
            )
          )}
        </ul>
        <LinkForm action={addLinkAction} />
      </section>
    </div>
  );
}
