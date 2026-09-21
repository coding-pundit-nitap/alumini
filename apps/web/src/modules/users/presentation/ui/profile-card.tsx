import type { ProfileView } from "../../domain/profile";

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

function monthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const index = Number(month) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${year}` : isoDate;
}

const TYPE_LABEL: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  GITHUB: "GitHub",
  TWITTER: "X (Twitter)",
  WEBSITE: "Website",
  OTHER: "Link",
};

/** Renders exactly the keys the visibility rule left in the view; a missing key renders nothing, and an
 * empty (but visible) list renders nothing either — there is nothing to show. Item ids are never present
 * on a `ProfileView` (they are stripped in `projectProfile`), so a viewer never sees one. */
export function ProfileCard({ view }: { view: ProfileView }) {
  const { institution, experience, education, skills, links } = view;

  return (
    <article className="border-border space-y-6 rounded-lg border p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{view.fullName}</h1>
        {view.headline ? (
          <p className="text-muted-foreground">{view.headline}</p>
        ) : null}
        {view.location ? (
          <p className="text-muted-foreground text-sm">{view.location}</p>
        ) : null}
      </header>

      {institution &&
      (institution.department ||
        institution.degree ||
        institution.graduationYear) ? (
        <p className="text-sm">
          {[institution.degree, institution.department]
            .filter(Boolean)
            .join(", ")}
          {institution.graduationYear
            ? ` · Batch of ${institution.graduationYear}`
            : ""}
        </p>
      ) : null}

      {view.bio ? (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">About</h2>
          <p className="text-sm whitespace-pre-line">{view.bio}</p>
        </section>
      ) : null}

      {experience && experience.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Experience</h2>
          <ul className="space-y-2">
            {experience.map((item) => (
              <li
                key={`${item.company}:${item.designation}:${item.startDate}`}
                className="text-sm"
              >
                <p className="font-medium">
                  {item.designation} · {item.company}
                </p>
                <p className="text-muted-foreground">
                  {monthYear(item.startDate)} –{" "}
                  {item.isCurrent
                    ? "Present"
                    : item.endDate
                      ? monthYear(item.endDate)
                      : ""}
                  {item.industry ? ` · ${item.industry}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {education && education.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Education</h2>
          <ul className="space-y-2">
            {education.map((item) => (
              <li
                key={`${item.institution}:${item.qualification}:${item.startYear}`}
                className="text-sm"
              >
                <p className="font-medium">{item.institution}</p>
                <p className="text-muted-foreground">
                  {item.qualification}
                  {item.fieldOfStudy ? `, ${item.fieldOfStudy}` : ""} ·{" "}
                  {item.startYear}–{item.endYear ?? "present"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {skills && skills.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Skills</h2>
          <ul className="flex flex-wrap gap-2">
            {skills.map((item) => (
              <li
                key={item.skill}
                className="bg-muted rounded-full px-2.5 py-0.5 text-sm"
              >
                {item.skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {links && links.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Links</h2>
          <ul className="space-y-1">
            {links.map((item) => (
              <li key={item.url} className="text-sm">
                <a
                  href={item.url}
                  rel="nofollow noopener ugc"
                  target="_blank"
                  className="underline"
                >
                  {TYPE_LABEL[item.type] ?? item.type}: {item.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
