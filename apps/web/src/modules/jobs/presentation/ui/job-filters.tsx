import { MapPin } from "lucide-react";
import Link from "next/link";

import { Button } from "@nitap/ui/components/button";
import { cn } from "@nitap/ui/lib/utils";

import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  type EmploymentType,
  type WorkMode,
} from "../../domain/job";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL } from "../labels";

export type JobFilterValues = {
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  location?: string;
};

/** `/jobs` with these filters (empty ones dropped). Never carries a cursor, so it starts from the first page. */
export function jobsHref(filters: JobFilterValues) {
  const qs = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => !!e[1])
  ).toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

const PILL =
  "bg-muted/60 focus-within:ring-ring/60 flex h-10 items-center gap-2 rounded-full px-4 focus-within:ring-2";

/**
 * A plain GET form: the URL is the state, so filters and pages are linkable and need no client JS. Submitting
 * drops `cursor`. Employment type is a row of links that keep the other filters; the form carries it hidden.
 */
export function JobFilters({ filters }: { filters: JobFilterValues }) {
  const types: (EmploymentType | undefined)[] = [
    undefined,
    ...EMPLOYMENT_TYPES,
  ];
  return (
    <form
      method="get"
      action="/jobs"
      aria-label="Filter jobs"
      className="space-y-3 border-b px-4 py-3 sm:px-5"
    >
      {filters.employmentType ? (
        <input
          type="hidden"
          name="employmentType"
          value={filters.employmentType}
        />
      ) : null}
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:items-center">
        <label className={cn(PILL, "col-span-2 min-w-0 sm:flex-1")}>
          <MapPin aria-hidden className="text-muted-foreground size-4" />
          <input
            name="location"
            type="search"
            defaultValue={filters.location ?? ""}
            placeholder="Location, e.g. Bengaluru or Remote"
            aria-label="Location"
            maxLength={200}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <select
          name="workMode"
          aria-label="Work mode"
          defaultValue={filters.workMode ?? ""}
          className={cn(PILL, "min-w-0 text-sm outline-none")}
        >
          <option value="">Any work mode</option>
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {WORK_MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-10 rounded-full px-5">
          Search
        </Button>
      </div>
      <nav
        aria-label="Employment type"
        className="-mx-4 flex scrollbar-none gap-1.5 overflow-x-auto px-4 sm:-mx-5 sm:px-5"
      >
        {types.map((type) => {
          const active = type === filters.employmentType;
          return (
            <Link
              key={type ?? "all"}
              href={jobsHref({ ...filters, employmentType: type })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {type ? EMPLOYMENT_LABEL[type] : "All"}
            </Link>
          );
        })}
      </nav>
    </form>
  );
}
