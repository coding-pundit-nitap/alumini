import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { SORTS } from "@nitap/search";

type Params = Record<string, string | string[] | undefined>;
type Department = { code: string; name: string };

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  relevance: "Best match",
  name: "Name",
  graduationYear: "Batch (oldest first)",
  "-graduationYear": "Batch (newest first)",
};

/** Filters that get a removable chip, in display order; `q` lives in the search box and `sort` is not a filter. */
const CHIP_LABEL: Record<string, string> = {
  department: "",
  graduationYear: "Batch",
  graduationYearFrom: "Batch from",
  graduationYearTo: "Batch to",
  location: "In",
  company: "At",
  designation: "Role",
  industry: "Industry",
  skills: "Skill",
};

const values = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);

/**
 * One chip per applied filter value, each linking to the same search without that value (and without
 * `cursor`, so it starts from the first page). Departments show by name.
 */
export function chipsFor(params: Params, departments: Department[]) {
  const chips: { key: string; label: string; href: string }[] = [];
  for (const [key, prefix] of Object.entries(CHIP_LABEL)) {
    for (const value of values(params[key])) {
      const rest = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (k === "cursor") continue;
        for (const each of values(v)) {
          if (!(k === key && each === value)) rest.append(k, each);
        }
      }
      const shown =
        key === "department"
          ? (departments.find((d) => d.code === value)?.name ?? value)
          : value;
      const qs = rest.toString();
      chips.push({
        key: `${key}=${value}`,
        label: prefix ? `${prefix} ${shown}` : shown,
        href: qs ? `/directory?${qs}` : "/directory",
      });
    }
  }
  return chips;
}

/** The same search with every filter cleared (the search text stays), or null when no filter is set. */
export function clearFiltersHref(params: Params) {
  if (!Object.keys(CHIP_LABEL).some((key) => values(params[key]).length))
    return null;
  const q = values(params.q)[0];
  return q ? `/directory?${new URLSearchParams({ q })}` : "/directory";
}

const SELECT =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]";

/**
 * A plain GET form: the URL is the state, so filters and pages are linkable and need no client JS.
 * Submitting drops `cursor`, which starts the list from the first page. The filters fold into a native
 * `<details>`; inputs in a closed one still submit.
 */
export function DirectoryFilters({
  params,
  departments,
  open = false,
}: {
  /** The raw URL params: the form shows what was asked for, even when it didn't parse. */
  params: Params;
  departments: Department[];
  /** Unfold the filters, e.g. when one of them has a problem. */
  open?: boolean;
}) {
  const chips = chipsFor(params, departments);
  const value = (key: string) => values(params[key])[0] ?? "";
  return (
    <form
      method="get"
      action="/directory"
      role="search"
      className="space-y-3 border-b px-4 py-3 sm:px-5"
    >
      <div className="flex items-center gap-2">
        <label className="bg-muted/60 focus-within:ring-ring/60 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-4 focus-within:ring-2">
          <Search aria-hidden className="text-muted-foreground size-4" />
          <input
            name="q"
            type="search"
            defaultValue={value("q")}
            placeholder="Search name, headline, company or skill"
            aria-label="Search"
            minLength={2}
            maxLength={100}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Button type="submit" className="h-10 rounded-full px-5">
          Search
        </Button>
      </div>

      <details open={open || undefined}>
        <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden className="size-3.5" />
          Filters
          {chips.length ? (
            <span className="bg-brand text-brand-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
              {chips.length}
              <span className="sr-only"> applied</span>
            </span>
          ) : null}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Department</span>
            <select
              name="department"
              defaultValue={value("department")}
              className={SELECT}
            >
              <option value="">Any</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Sort by</span>
            <select name="sort" defaultValue={value("sort")} className={SELECT}>
              <option value="">Default</option>
              {SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Batch from</span>
            <Input
              name="graduationYearFrom"
              type="number"
              min={2010}
              max={2100}
              defaultValue={value("graduationYearFrom")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Batch to</span>
            <Input
              name="graduationYearTo"
              type="number"
              min={2010}
              max={2100}
              defaultValue={value("graduationYearTo")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Location</span>
            <Input
              name="location"
              defaultValue={value("location")}
              maxLength={100}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Company</span>
            <Input
              name="company"
              defaultValue={value("company")}
              maxLength={100}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Designation</span>
            <Input
              name="designation"
              defaultValue={value("designation")}
              maxLength={100}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Skill</span>
            <Input
              name="skills"
              defaultValue={value("skills")}
              maxLength={100}
            />
          </label>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Link
              href="/directory"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "text-muted-foreground rounded-full",
              })}
            >
              Reset
            </Link>
            <Button type="submit" size="sm" className="rounded-full">
              Apply filters
            </Button>
          </div>
        </div>
      </details>

      {chips.length ? (
        <ul aria-label="Applied filters" className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.href}
                aria-label={`Remove filter: ${chip.label}`}
                className="bg-brand/12 text-brand hover:bg-brand/20 inline-flex h-7 items-center gap-1 rounded-full pr-2 pl-3 text-xs font-medium transition-colors"
              >
                {chip.label}
                <X aria-hidden className="size-3" />
              </Link>
            </li>
          ))}
          {chips.length > 1 ? (
            <li>
              <Link
                href={clearFiltersHref(params) ?? "/directory"}
                className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center px-2 text-xs underline-offset-2 hover:underline"
              >
                Clear all
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </form>
  );
}
