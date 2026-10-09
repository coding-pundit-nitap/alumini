import type { ProfileRecord } from "./profile";

const text = (value: string | null) => Boolean(value?.trim());

/** Eight equally weighted, member-editable checks. Institutional fields are not counted. */
const CHECKS: [label: string, done: (p: ProfileRecord) => boolean][] = [
  ["Headline", (p) => text(p.headline)],
  ["About", (p) => text(p.bio)],
  ["Location", (p) => text(p.location)],
  ["Photo", (p) => p.photoUploadId !== null],
  ["Experience", (p) => p.experience.length > 0],
  ["Education", (p) => p.education.length > 0],
  ["Skills", (p) => p.skills.length > 0],
  ["Links", (p) => p.links.length > 0],
];

export function profileCompleteness(record: ProfileRecord | null): {
  percent: number;
  missing: string[];
} {
  const missing = CHECKS.filter(([, done]) => !record || !done(record)).map(
    ([label]) => label
  );
  return {
    percent: Math.round(
      ((CHECKS.length - missing.length) / CHECKS.length) * 100
    ),
    missing,
  };
}
