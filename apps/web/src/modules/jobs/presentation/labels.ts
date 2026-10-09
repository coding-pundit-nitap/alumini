import type { EmploymentType, JobStatus, WorkMode } from "../domain/job";

export const STATUS_LABEL: Record<JobStatus, string> = {
  PENDING_REVIEW: "Pending review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CLOSED: "Closed",
};

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  ONSITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

const DAY = 24 * 60 * 60 * 1000;
const utcDay = (d: Date) =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * A deadline is a date, so days compare in UTC. `soon` marks the last three
 * days.
 */
export function deadlineLabel(
  deadline: Date,
  now: Date = new Date()
): { text: string; soon: boolean } {
  const days = Math.round((utcDay(deadline) - utcDay(now)) / DAY);
  if (days <= 0) return { text: "Closes today", soon: true };
  if (days === 1) return { text: "Closes tomorrow", soon: true };
  if (days <= 7) return { text: `Closes in ${days} days`, soon: days <= 3 };
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year:
      deadline.getUTCFullYear() === now.getUTCFullYear()
        ? undefined
        : "numeric",
    timeZone: "UTC",
  }).format(deadline);
  return { text: `Apply by ${date.replace("Sept", "Sep")}`, soon: false };
}
