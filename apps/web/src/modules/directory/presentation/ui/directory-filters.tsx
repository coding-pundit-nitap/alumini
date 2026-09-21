import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { SORTS, type DirectoryQuery } from "@nitap/search";

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  relevance: "Best match",
  name: "Name",
  graduationYear: "Batch (oldest first)",
  "-graduationYear": "Batch (newest first)",
};

/**
 * A plain GET form: the URL is the state, so filters and pages are linkable and need no client JS.
 * Submitting drops `cursor`, which starts the list from the first page.
 */
export function DirectoryFilters({
  query,
  departments,
}: {
  query: Partial<DirectoryQuery>;
  departments: { code: string; name: string }[];
}) {
  return (
    <form method="get" className="space-y-4" role="search">
      <div className="flex gap-2">
        <Input
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          placeholder="Search name, headline, company or skill"
          aria-label="Search"
          minLength={2}
          maxLength={100}
        />
        <Button type="submit">Search</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span>Department</span>
          <select
            name="department"
            defaultValue={query.department?.[0] ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-2"
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
          <span>Batch from</span>
          <Input
            name="graduationYearFrom"
            type="number"
            min={2010}
            max={2100}
            defaultValue={query.graduationYearFrom ?? ""}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Batch to</span>
          <Input
            name="graduationYearTo"
            type="number"
            min={2010}
            max={2100}
            defaultValue={query.graduationYearTo ?? ""}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Location</span>
          <Input
            name="location"
            defaultValue={query.location ?? ""}
            maxLength={100}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Company</span>
          <Input
            name="company"
            defaultValue={query.company ?? ""}
            maxLength={100}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Designation</span>
          <Input
            name="designation"
            defaultValue={query.designation ?? ""}
            maxLength={100}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Skill</span>
          <Input
            name="skills"
            defaultValue={query.skills?.[0] ?? ""}
            maxLength={100}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Sort by</span>
          <select
            name="sort"
            defaultValue={query.sort ?? ""}
            className="border-input bg-background h-9 w-full rounded-md border px-2"
          >
            <option value="">Default</option>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
