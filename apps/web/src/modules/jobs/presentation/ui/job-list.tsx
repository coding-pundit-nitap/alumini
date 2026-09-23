import type { PublishedJobCard } from "../../application/job-queries";

const EMPLOYMENT_LABEL: Record<PublishedJobCard["employmentType"], string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
};
const WORK_MODE_LABEL: Record<PublishedJobCard["workMode"], string> = {
  ONSITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

/** FR-JOB. PUBLISHED, unexpired postings anyone with job.read may browse (spec J-8/J-9/J-12). */
export function JobList({ items }: { items: PublishedJobCard[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No open postings match yet.
      </p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((job) => (
        <li key={job.id} className="space-y-2 rounded-lg border p-4">
          <p className="font-medium">{job.title}</p>
          <p className="text-muted-foreground text-sm">
            {job.company} · {job.location}
          </p>
          <p className="text-muted-foreground text-sm">
            {EMPLOYMENT_LABEL[job.employmentType]} ·{" "}
            {WORK_MODE_LABEL[job.workMode]}
          </p>
          <p className="text-sm">{job.description}</p>
          {job.skills.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <li
                  key={skill}
                  className="bg-muted rounded-full px-2 py-0.5 text-xs"
                >
                  {skill}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground text-xs">
            Apply by {job.deadline.toLocaleDateString()}
          </p>
          <a
            href={job.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline underline-offset-2"
          >
            Apply
          </a>
        </li>
      ))}
    </ul>
  );
}
