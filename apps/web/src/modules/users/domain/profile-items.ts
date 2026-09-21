import { z } from "zod";

import { optionalText, sanitiseSingleLine } from "./profile-input";

/** A problem with one field, found by a rule that needs the clock (so it cannot be a static schema rule). */
export type FieldProblem = { field: string; message: string };

const requiredText = (message: string, max: number) =>
  z
    .string(message)
    .transform(sanitiseSingleLine)
    .pipe(
      z.string().min(1, message).max(max, `Use at most ${max} characters.`)
    );

// ---------------------------------------------------------------- experience

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form (2020-02-30 is not one). */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const startDate = z
  .string("Enter a valid start date.")
  .trim()
  .refine(isValidIsoDate, "Enter a valid start date.");

const endDate = z
  .string()
  .optional()
  .transform((value) => value?.trim() || null)
  .pipe(
    z.string().refine(isValidIsoDate, "Enter a valid end date.").nullable()
  );

/** The only form fields the experience actions read (see `pickFields`). */
export const EXPERIENCE_FIELDS = [
  "company",
  "industry",
  "designation",
  "startDate",
  "endDate",
  "isCurrent",
] as const;

/**
 * A role is current exactly when it has no end date (the database CHECK says the same). A checkbox sends
 * "on" when ticked and nothing otherwise. Strict: a forged `userId` fails validation.
 */
export const experienceSchema = z
  .object({
    company: requiredText("Enter the company.", 100),
    industry: optionalText(sanitiseSingleLine, 80),
    designation: requiredText("Enter your role.", 100),
    startDate,
    endDate,
    isCurrent: z
      .string()
      .optional()
      .transform((value) => value === "on" || value === "true"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["endDate"], message });
    if (value.isCurrent && value.endDate !== null) {
      problem("Leave the end date empty for your current role.");
    } else if (!value.isCurrent && value.endDate === null) {
      problem("Enter the end date, or mark this as your current role.");
    } else if (
      value.endDate !== null &&
      isValidIsoDate(value.startDate) &&
      value.endDate < value.startDate
    ) {
      problem("The end date cannot be before the start date.");
    }
  });

export type ExperienceInput = z.output<typeof experienceSchema>;
export type ExperienceItem = ExperienceInput & { id: string };

/** Dates in the future are refused; they need the clock, so the database CHECK cannot say it. */
export function experienceClockProblems(
  input: ExperienceInput,
  now: Date
): FieldProblem[] {
  const today = now.toISOString().slice(0, 10);
  const problems: FieldProblem[] = [];
  if (input.startDate > today) {
    problems.push({
      field: "startDate",
      message: "The start date cannot be in the future.",
    });
  }
  if (input.endDate !== null && input.endDate > today) {
    problems.push({
      field: "endDate",
      message: "The end date cannot be in the future.",
    });
  }
  return problems;
}

// ----------------------------------------------------------------- education

const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

function toYear(message: string) {
  return (
    value: string | undefined,
    ctx: z.RefinementCtx
  ): number | typeof z.NEVER => {
    const text = (value ?? "").trim();
    const year = /^\d{4}$/.test(text) ? Number(text) : Number.NaN;
    if (!(year >= MIN_YEAR && year <= MAX_YEAR)) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return year;
  };
}

/** The only form fields the education actions read. */
export const EDUCATION_FIELDS = [
  "institution",
  "qualification",
  "fieldOfStudy",
  "startYear",
  "endYear",
] as const;

/** Additional education (prior or later study). The institutional record is not editable here (FR-PROFILE-004). */
export const educationSchema = z
  .object({
    institution: requiredText("Enter the institution.", 150),
    qualification: requiredText("Enter the qualification.", 100),
    fieldOfStudy: optionalText(sanitiseSingleLine, 100),
    startYear: z
      .string("Enter a valid start year.")
      .transform(toYear("Enter a valid start year.")),
    endYear: z
      .string()
      .optional()
      .transform((value, ctx) =>
        (value ?? "").trim() === ""
          ? null
          : toYear("Enter a valid end year, or leave it empty if ongoing.")(
              value,
              ctx
            )
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endYear !== null && value.endYear < value.startYear) {
      ctx.addIssue({
        code: "custom",
        path: ["endYear"],
        message: "The end year cannot be before the start year.",
      });
    }
  });

export type EducationInput = z.output<typeof educationSchema>;
export type EducationItem = EducationInput & { id: string };

export function educationClockProblems(
  input: EducationInput,
  now: Date
): FieldProblem[] {
  const year = now.getUTCFullYear();
  const problems: FieldProblem[] = [];
  if (input.startYear > year) {
    problems.push({
      field: "startYear",
      message: "The start year cannot be in the future.",
    });
  }
  if (input.endYear !== null && input.endYear > year) {
    problems.push({
      field: "endYear",
      message: "The end year cannot be in the future.",
    });
  }
  return problems;
}

// -------------------------------------------------------------------- skills

export const SKILL_FIELDS = ["skill"] as const;

/** NFKC first, so compatibility forms (full-width letters) collapse; casing is kept for display. */
export const skillSchema = z
  .object({
    skill: z
      .string("Enter a skill.")
      .transform((value) => sanitiseSingleLine(value.normalize("NFKC")))
      .pipe(
        z
          .string()
          .min(1, "Enter a skill.")
          .max(50, "Use at most 50 characters.")
      ),
  })
  .strict();

export type SkillInput = z.output<typeof skillSchema>;
export type SkillItem = SkillInput & { id: string };

// --------------------------------------------------------------------- links

export const LINK_TYPES = [
  "LINKEDIN",
  "GITHUB",
  "TWITTER",
  "WEBSITE",
  "OTHER",
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const LINK_FIELDS = ["type", "url"] as const;

const TYPE_HOSTS: Partial<
  Record<LinkType, { label: string; domains: string[] }>
> = {
  LINKEDIN: { label: "LinkedIn", domains: ["linkedin.com"] },
  GITHUB: { label: "GitHub", domains: ["github.com"] },
  TWITTER: { label: "X (Twitter)", domains: ["twitter.com", "x.com"] },
};

const MAX_URL_LENGTH = 2048;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type LinkUrlResult =
  { ok: true; url: string } | { ok: false; message: string };

/**
 * Only public `https` links are stored: no other scheme (`javascript:` and `data:` included), no
 * credentials, no bare or private-looking hosts. The host is lowercased, the fragment dropped and a
 * default port stripped, so the same page cannot be added twice. A typed link must point at its site.
 */
export function normaliseLinkUrl(raw: string, type: LinkType): LinkUrlResult {
  const bad = (message: string): LinkUrlResult => ({ ok: false, message });

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return bad("Enter a full web address starting with https://.");
  }
  if (url.protocol !== "https:")
    return bad("The link must start with https://.");
  if (url.username || url.password) {
    return bad("Remove the username and password from the link.");
  }
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith("[") || IPV4.test(host)) {
    return bad("Use a public website address.");
  }

  const expected = TYPE_HOSTS[type];
  if (
    expected &&
    !expected.domains.some((d) => host === d || host.endsWith(`.${d}`))
  ) {
    return bad(`That does not look like a ${expected.label} link.`);
  }

  url.hash = "";
  const normalised =
    url.pathname === "/" && url.search === "" ? url.origin : url.href;
  if (normalised.length > MAX_URL_LENGTH) return bad("Use a shorter link.");
  return { ok: true, url: normalised };
}

export const linkSchema = z
  .object({
    type: z.enum(LINK_TYPES, "Choose a link type."),
    url: z.string("Enter a link."),
  })
  .strict()
  .transform((value, ctx) => {
    const result = normaliseLinkUrl(value.url, value.type);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", path: ["url"], message: result.message });
      return z.NEVER;
    }
    return { type: value.type, url: result.url };
  });

export type LinkInput = z.output<typeof linkSchema>;
export type LinkItem = LinkInput & { id: string };
