import { z } from "zod";

export const SORTS = [
  "relevance",
  "name",
  "graduationYear",
  "-graduationYear",
] as const;
export type Sort = (typeof SORTS)[number];

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;

const text = z.string().trim().min(1).max(100);
const year = z.coerce.number().int().min(2010).max(2100);

/**
 * Provider-neutral. Empty strings count as absent, so a plain HTML form
 * validates.
 */
const schema = z
  .object({
    q: z.string().trim().min(2).max(100).optional(),
    department: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    graduationYear: z.array(year).max(10).default([]),
    graduationYearFrom: year.optional(),
    graduationYearTo: year.optional(),
    company: text.optional(),
    industry: text.optional(),
    designation: text.optional(),
    location: text.optional(),
    skills: z.array(text).max(5).default([]),
    sort: z.enum(SORTS).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    cursor: z.string().max(400).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sort === "relevance" && !value.q) {
      ctx.addIssue({
        code: "custom",
        path: ["sort"],
        message: "Sorting by relevance needs a search term.",
      });
    }
    if (
      value.graduationYearFrom !== undefined &&
      value.graduationYearTo !== undefined &&
      value.graduationYearFrom > value.graduationYearTo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["graduationYearFrom"],
        message: "The first year must not be after the last.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    sort: value.sort ?? (value.q ? ("relevance" as const) : ("name" as const)),
  }));

export type DirectoryQuery = z.output<typeof schema>;
export type QueryProblem = { field: string; message: string };

export type ParsedQuery =
  { ok: true; query: DirectoryQuery } | { ok: false; problems: QueryProblem[] };

const MULTI = new Set(["department", "graduationYear", "skills"]);

/** Accepts `URLSearchParams` or a Next.js `searchParams` object. */
export function parseDirectoryQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>
): ParsedQuery {
  const entries =
    input instanceof URLSearchParams
      ? [...new Set(input.keys())].map((key) => [key, input.getAll(key)])
      : Object.entries(input).map(([key, value]) => [
          key,
          value === undefined ? [] : Array.isArray(value) ? value : [value],
        ]);

  const raw: Record<string, unknown> = {};
  for (const [key, values] of entries as [string, string[]][]) {
    const present = values.filter((v) => v.trim() !== "");
    if (present.length === 0) continue;
    raw[key] = MULTI.has(key) ? present : present[0];
  }

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, query: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "query",
      message: issue.message,
    })),
  };
}
